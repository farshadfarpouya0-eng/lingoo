import { createHmac } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlatformEvents, lessons, teacherProfiles, users } from "@/db/schema";
import { validMeetingLink } from "./meeting-links";
export { validMeetingLink };

/** Fixed rooms an administrator assigned to this tutor (empty string when none/invalid). */
export async function assignedTeacherLinks(teacherId: number) {
  const [profile] = await db.select({ meetUrl: teacherProfiles.meetUrl, zoomUrl: teacherProfiles.zoomUrl })
    .from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId)).limit(1);
  return { meet: validMeetingLink("meet", profile?.meetUrl || ""), zoom: validMeetingLink("zoom", profile?.zoomUrl || "") };
}
import { classroomSecret } from "./runtime-policy";
import { getIntegrationConfig } from "./integration-config";
import { canAccessLesson } from "./lesson-access";
import { isAccountSuspended } from "./account-status";
import { resolveVideoProvider, videoJoinUrl, VIDEO_SETUP_MESSAGE, type VideoProvider } from "./video-provider";

export type Platform = "undecided" | "lingo" | "daily" | "meet" | "zoom";
export type RoomSnapshot = {
  lessonId: number; platform: Platform; revision: number; meetingUrl: string; joinUrl: string;
  videoProvider: VideoProvider; videoMessage: string;
  state: "pending" | "early" | "open" | "closed"; issueReported: boolean; updatedAt: string | null;
};

function roomState(l: Pick<typeof lessons.$inferSelect, "status" | "startAt" | "duration">, role: "teacher" | "student") {
  const now = Date.now();
  const startsAt = l.startAt.getTime();
  const endsAt = startsAt + l.duration * 60_000;
  const graceEndsAt = endsAt + 15 * 60_000;

  // Cancellation is final. A stale/incorrect `completed` flag must not lock
  // participants out before the scheduled lesson window has actually ended.
  if (l.status === "cancelled" || now >= graceEndsAt) return "closed" as const;
  if (l.status !== "confirmed" && !(l.status === "completed" && now < graceEndsAt)) return "pending" as const;

  const earlyMinutes = role === "teacher" ? 30 : 10;
  if (now < startsAt - earlyMinutes * 60_000) return "early" as const;
  return "open" as const;
}
export function jitsiRoomName(lessonId: number) {
  return "lingorain-" + createHmac("sha256", classroomSecret()).update(`lesson:${lessonId}`).digest("hex").slice(0, 24);
}

export async function classroomSnapshot(actorId: number, lessonId: number, _displayName = ""): Promise<RoomSnapshot> {
  const [l] = await db.select({
    id: lessons.id, studentId: lessons.studentId, teacherId: lessons.teacherId,
    status: lessons.status, startAt: lessons.startAt, duration: lessons.duration,
    platform: lessons.platform, meetingUrl: lessons.meetingUrl, platformRevision: lessons.platformRevision,
    platformUpdatedAt: lessons.platformUpdatedAt, platformIssueAt: lessons.platformIssueAt,
  }).from(lessons).where(eq(lessons.id, lessonId));
  if (!l || !(await canAccessLesson(lessonId, actorId))) throw new Error("forbidden");
  const [actor] = await db.select({ role: users.role, suspended: users.suspended, suspendedUntil: users.suspendedUntil }).from(users).where(eq(users.id, actorId));
  const isAdminSandbox = actor?.role === "admin" && (await db.select({ topic: lessons.topic }).from(lessons).where(eq(lessons.id, lessonId)).limit(1))[0]?.topic.startsWith("[TEST]");
  if (actor?.role === "admin" && !isAdminSandbox) throw new Error("forbidden");
  const platform: Platform = ["lingo", "daily", "meet", "zoom"].includes(l.platform) ? l.platform as Platform : "undecided";
  const actorRole = actor?.role === "teacher" || isAdminSandbox ? "teacher" : actor?.role === "student" ? "student" : null;
  if (!actor || isAccountSuspended(actor.suspended, actor.suspendedUntil) || !actorRole) throw new Error("forbidden");
  const state = roomState(l, actorRole);
  let joinUrl = "";
  let videoProvider: VideoProvider = "unconfigured";
  if (state === "open" && platform === "lingo") {
    const cfg = await getIntegrationConfig();
    videoProvider = resolveVideoProvider(cfg.video);
    joinUrl = videoJoinUrl(cfg.video, videoProvider, jitsiRoomName(l.id));
  } else if (state === "open" && platform === "daily") {
    // Personal Daily tokens are issued by the dedicated authenticated endpoint.
    joinUrl = "";
  } else if (state === "open" && (platform === "meet" || platform === "zoom")) {
    // A lesson-specific link wins; otherwise use the tutor's admin-assigned fixed room.
    joinUrl = validMeetingLink(platform, l.meetingUrl) || (await assignedTeacherLinks(l.teacherId))[platform];
  }
  return { lessonId, platform, revision: l.platformRevision, state, joinUrl, videoProvider,
    videoMessage: platform === "lingo" && videoProvider === "unconfigured" ? VIDEO_SETUP_MESSAGE : "",
    meetingUrl: actorId === l.teacherId || state === "open" ? l.meetingUrl : "",
    issueReported: !!l.platformIssueAt, updatedAt: l.platformUpdatedAt?.toISOString() ?? null };
}
export async function chooseClassroom(actorId: number, lessonId: number, platform: string, meetingUrl: string) {
  // Existing Daily lessons remain accessible, but no new lesson may select Daily.
  if (!["lingo", "meet", "zoom"].includes(platform)) throw new Error("platform");
  const url = platform === "lingo" ? "" : validMeetingLink(platform, meetingUrl.trim());
  if ((platform === "meet" || platform === "zoom") && !url && !(await assignedTeacherLinks(actorId))[platform]) throw new Error("link");
  return db.transaction(async tx => {
    const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId)).for("update");
    if (!l || l.teacherId !== actorId) throw new Error("forbidden");
    const [actor] = await tx.select({ role: users.role, suspended: users.suspended, suspendedUntil: users.suspendedUntil }).from(users).where(eq(users.id, actorId));
    if (!actor || actor.role !== "teacher" || isAccountSuspended(actor.suspended, actor.suspendedUntil)) throw new Error("forbidden");
    if (roomState(l, "teacher") === "closed") throw new Error("closed");
    await tx.update(lessons).set({ platform, meetingUrl: url,
      platformRevision: sql`${lessons.platformRevision} + 1`, platformUpdatedAt: new Date(),
      platformIssueAt: null, platformIssueBy: null,
    }).where(eq(lessons.id, l.id));
    await tx.insert(lessonPlatformEvents).values({ lessonId: l.id, changedBy: actorId, fromPlatform: l.platform, toPlatform: platform });
  });
}
export async function reportConnectionProblem(actorId: number, lessonId: number) {
  const [l] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!l || !(await canAccessLesson(lessonId, actorId)) || l.teacherId === actorId) throw new Error("forbidden");
  if (roomState(l, "student") !== "open") throw new Error("closed");
  await db.update(lessons).set({ platformIssueAt: new Date(), platformIssueBy: actorId })
    .where(and(eq(lessons.id, lessonId), inArray(lessons.status, ["confirmed"])));
}
