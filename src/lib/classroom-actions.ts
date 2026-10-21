"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlatformEvents, lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { validMeetingLink } from "@/lib/room-service";

type SaveResult = { ok?: boolean; error?: string };
const PLATFORMS = ["lingo", "daily", "meet", "zoom"] as const;

/** Save / change the classroom. Both the tutor and the student can choose. */
export async function saveClassroom(prev: SaveResult, formData: FormData): Promise<SaveResult> {
  const me = await getUser();
  if (!me) return { ok: false, error: "forbidden" };

  const lessonId = Number(formData.get("lessonId"));
  const platform = String(formData.get("platform") ?? "");
  const rawUrl = String(formData.get("meetingUrl") ?? "").trim();

  if (!Number.isInteger(lessonId) || lessonId < 1) return { ok: false, error: "forbidden" };
  if (!PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) return { ok: false, error: "forbidden" };

  const [l] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
  if (!l) return { ok: false, error: "forbidden" };

  const isTutor = l.teacherId === me.id;
  const isStudent = l.studentId === me.id;
  if (!isTutor && !isStudent) return { ok: false, error: "forbidden" };

  if (["completed", "cancelled"].includes(l.status)) return { ok: false, error: "closed" };
  const endAt = l.startAt.getTime() + (l.duration + 15) * 60_000;
  if (Date.now() > endAt) return { ok: false, error: "closed" };

  const url = platform === "lingo" || platform === "daily" ? "" : validMeetingLink(platform, rawUrl);
  if (platform !== "lingo" && platform !== "daily" && !url) return { ok: false, error: "link" };

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

/** Student reports a connection problem → asks for a platform switch. */
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