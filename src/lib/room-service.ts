import { createHmac } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlatformEvents, lessons, users } from "@/db/schema";
import { classroomSecret } from "./runtime-policy";
import { getIntegrationConfig } from "./integration-config";
import { canAccessLesson } from "./lesson-access";

export type Platform = "undecided" | "lingo" | "daily" | "meet" | "zoom";
export type RoomSnapshot = {
  lessonId: number; platform: Platform; revision: number; meetingUrl: string; joinUrl: string;
  state: "pending" | "early" | "open" | "closed"; issueReported: boolean; updatedAt: string | null;
};
export function validMeetingLink(platform: string, raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return "";
    if (platform === "meet" && u.hostname === "meet.google.com" && /^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[a-z0-9_-]+)\/?$/i.test(u.pathname)) return u.href;
    if (platform === "zoom" && (u.hostname === "zoom.us" || u.hostname.endsWith(".zoom.us")) && /^\/(?:j|s|my|wc)\/[a-z0-9/_-]+\/?$/i.test(u.pathname)) return u.href;
    return "";
  } catch { return ""; }
}
function roomState(l: Pick<typeof lessons.$inferSelect, "status" | "startAt" | "duration">, role: "teacher" | "student") {
  const now = Date.now();
  if (["completed", "cancelled"].includes(l.status) || now > l.startAt.getTime() + (l.duration + 15) * 60_000) return "closed" as const;
  if (l.status !== "confirmed") return "pending" as const;
  const earlyMinutes = role === "teacher" ? 30 : 10;
  if (now < l.startAt.getTime() - earlyMinutes * 60_000) return "early" as const;
  return "open" as const;
}
export async function classroomSnapshot(actorId: number, lessonId: number, displayName: string): Promise<RoomSnapshot> {
  const [l] = await db.select({
    id: lessons.id, studentId: lessons.studentId, teacherId: lessons.teacherId,
    status: lessons.status, startAt: lessons.startAt, duration: lessons.duration,
    platform: lessons.platform, meetingUrl: lessons.meetingUrl, platformRevision: lessons.platformRevision,
    platformUpdatedAt: lessons.platformUpdatedAt, platformIssueAt: lessons.platformIssueAt,
  }).from(lessons).where(eq(lessons.id, lessonId));
  if (!l || !(await canAccessLesson(lessonId, actorId))) throw new Error("forbidden");
  const [actor] = await db.select({ role: users.role, suspended: users.suspended }).from(users).where(eq(users.id, actorId));
  const isAdminSandbox = actor?.role === "admin" && (await db.select({ topic: lessons.topic }).from(lessons).where(eq(lessons.id, lessonId)).limit(1))[0]?.topic.startsWith("[TEST]");
  if (actor?.role === "admin" && !isAdminSandbox) throw new Error("forbidden");
  const platform: Platform = ["lingo", "daily", "meet", "zoom"].includes(l.platform) ? l.platform as Platform : "undecided";
  const actorRole = actor?.role === "teacher" || isAdminSandbox ? "teacher" : actor?.role === "student" ? "student" : null;
  if (!actor || actor.suspended || !actorRole) throw new Error("forbidden");
  const state = roomState(l, actorRole);
  let joinUrl = "";
  if (state === "open" && platform === "lingo") {
    const cfg = await getIntegrationConfig();
    const domain = (cfg.video.jitsiDomain || "meet.jit.si").replace(/[^a-z0-9.-]/gi, "");
    const room = "lingorain-" + createHmac("sha256", classroomSecret()).update(`lesson:${l.id}`).digest("hex").slice(0, 24);
    joinUrl = `https://${domain}/${room}#userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}&config.disableDeepLinking=true&interfaceConfigOverwrite.SHOW_JITSI_WATERMARK=false`;
  } else if (state === "open" && platform === "daily") {
    // A short-lived, participant-specific Daily meeting token is issued by the separate daily-token endpoint.
    joinUrl = "";
  } else if (state === "open" && (platform === "meet" || platform === "zoom")) {
    joinUrl = validMeetingLink(platform, l.meetingUrl);
  }
  return { lessonId, platform, revision: l.platformRevision, state, joinUrl,
    meetingUrl: actorId === l.teacherId || state === "open" ? l.meetingUrl : "",
    issueReported: !!l.platformIssueAt, updatedAt: l.platformUpdatedAt?.toISOString() ?? null };
}
export async function chooseClassroom(actorId: number, lessonId: number, platform: string, meetingUrl: string) {
  if (!["lingo", "daily", "meet", "zoom"].includes(platform)) throw new Error("platform");
  if (platform === "daily") {
    const cfg = await getIntegrationConfig();
    if (cfg.recording.provider !== "daily" || !cfg.recording.dailyApiKey || !cfg.recording.dailyDomain) throw new Error("daily_unconfigured");
  }
  const url = platform === "lingo" || platform === "daily" ? "" : validMeetingLink(platform, meetingUrl.trim());
  if (platform !== "lingo" && platform !== "daily" && !url) throw new Error("link");
  return db.transaction(async tx => {
    const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId)).for("update");
    if (!l || l.teacherId !== actorId) throw new Error("forbidden");
    const [actor] = await tx.select({ role: users.role, suspended: users.suspended }).from(users).where(eq(users.id, actorId));
    if (!actor || actor.role !== "teacher" || actor.suspended) throw new Error("forbidden");
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
