"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlatformEvents, lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { isAccountSuspended } from "@/lib/account-status";
import { assignedTeacherLinks, validMeetingLink } from "@/lib/room-service";
type SaveResult = { ok?: boolean; error?: string };
const PLATFORMS = ["lingo", "meet", "zoom"] as const;

/** Only the owning tutor may select LingoRoom, Google Meet or Zoom. */
export async function saveClassroom(_prev: SaveResult, formData: FormData): Promise<SaveResult> {
  const me = await getUser();
  if (!me || isAccountSuspended(me.suspended, me.suspendedUntil)) return { ok: false, error: "forbidden" };

  const lessonId = Number(formData.get("lessonId"));
  const platform = String(formData.get("platform") ?? "");
  const rawUrl = String(formData.get("meetingUrl") ?? "").trim();

  if (!Number.isInteger(lessonId) || lessonId < 1) return { ok: false, error: "forbidden" };
  if (!PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) return { ok: false, error: "forbidden" };

  const [l] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!l) return { ok: false, error: "forbidden" };

  // Classroom selection is tutor-only. Students must never be able to choose or switch platforms,
  // even by replaying the server action manually.
  const isTutor = l.teacherId === me.id;
  if (!isTutor) return { ok: false, error: "forbidden" };
  const assigned = platform === "meet" || platform === "zoom" ? (await assignedTeacherLinks(l.teacherId))[platform] : "";
  const now = Date.now();
  const graceEndsAt = l.startAt.getTime() + (l.duration + 15) * 60_000;
  if (l.status === "cancelled" || now >= graceEndsAt) return { ok: false, error: "closed" };
  // Match roomState(): tolerate a stale completed flag until the scheduled
  // lesson window and its 15-minute grace period have elapsed.

  // A tutor may override with a lesson-specific link. Otherwise store "" so the
  // classroom always follows the admin-assigned room, including later admin changes.
  const url = platform === "lingo" ? "" : validMeetingLink(platform, rawUrl);
  if ((platform === "meet" || platform === "zoom") && !url && !assigned) return { ok: false, error: "link" };

  await db.update(lessons).set({
    platform,
    meetingUrl: url,
    platformRevision: sql`${lessons.platformRevision} + 1`,
    platformUpdatedAt: new Date(),
    platformIssueAt: null,
    platformIssueBy: null,
  }).where(eq(lessons.id, l.id));

  await db.insert(lessonPlatformEvents).values({
    lessonId: l.id,
    changedBy: me.id,
    fromPlatform: l.platform,
    toPlatform: platform,
  });

  revalidatePath(`/classroom/${lessonId}`);
  return { ok: true };
}

/** Report a connection problem so the other side knows to switch platform. */
export async function requestClassroomSwitch(lessonId: number): Promise<{ ok: boolean }> {
  const me = await getUser();
  if (!me) return { ok: false };
  const id = Number(lessonId);
  if (!Number.isInteger(id) || id < 1) return { ok: false };

  const [l] = await db.select().from(lessons).where(eq(lessons.id, id));
  if (!l) return { ok: false };
  if (l.teacherId !== me.id && l.studentId !== me.id) return { ok: false };

  await db.update(lessons)
    .set({ platformIssueAt: new Date(), platformIssueBy: me.id })
    .where(eq(lessons.id, id));

  revalidatePath(`/classroom/${id}`);
  return { ok: true };
}
