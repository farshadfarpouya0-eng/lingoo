import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessons, userPresence, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { hit } from "@/lib/ratelimit";
import { classroomSnapshot } from "@/lib/room-service";
import { canAccessLesson, activeLessonStudentIds } from "@/lib/lesson-access";
import { isAccountSuspended } from "@/lib/account-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getUser();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1) return Response.json({ error: "Not found" }, { status: 404 });
  if (!await hit(`presence:${actor.id}`, 120, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });
  const [lesson] = await db.select({ id: lessons.id, studentId: lessons.studentId, teacherId: lessons.teacherId, status: lessons.status })
    .from(lessons).where(eq(lessons.id, lessonId));
  if (!lesson || !(await canAccessLesson(lessonId, actor.id)) || lesson.status !== "confirmed") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const room = await classroomSnapshot(actor.id, lessonId, actor.name);
    if (room.state !== "open") return Response.json({ error: "Presence is available during your class access window" }, { status: 403 });
  } catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  const now = new Date();
  await db.insert(userPresence).values({ userId: actor.id, online: true, lastSeenAt: now })
    .onConflictDoUpdate({ target: userPresence.userId, set: { online: true, lastSeenAt: now } });
  const candidates = actor.id === lesson.teacherId
    ? (await activeLessonStudentIds(lessonId, lesson.studentId, "semi_private")).filter(id => id !== actor.id)
    : [lesson.teacherId];
  const otherIds = candidates.length ? candidates : [actor.id === lesson.teacherId ? lesson.studentId : lesson.teacherId];
  const others = await db.select({ id: users.id, name: users.name, suspended: users.suspended, suspendedUntil: users.suspendedUntil, presence: userPresence })
    .from(users).leftJoin(userPresence, eq(userPresence.userId, users.id)).where(inArray(users.id, otherIds));
  const other = others.find(o => o.presence?.online && now.getTime() - (o.presence.lastSeenAt?.getTime() || 0) <= 60_000) || others[0];
  const visible = other?.presence?.visible !== false;
  const lastSeenMs = other?.presence?.lastSeenAt?.getTime() ?? 0;
  const recentlySeen = !!lastSeenMs && now.getTime() - lastSeenMs <= 60_000;
  return Response.json({
    other: { name: visible ? (other?.name ?? "Participant") : "Participant", online: visible && recentlySeen && !!other?.presence?.online && !isAccountSuspended(other?.suspended ?? false, other?.suspendedUntil),
      lastSeenAt: visible ? (other?.presence?.lastSeenAt?.toISOString() ?? null) : null, hidden: !visible },
    otherCount: others.filter(o => o.id !== actor.id).length,
    serverTime: now.toISOString(),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
