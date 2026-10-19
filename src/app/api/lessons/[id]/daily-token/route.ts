import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { createDailyToken } from "@/lib/daily-video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !["teacher", "student"].includes(user.role)) return Response.json({ error: "Sign in as a class participant." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1 || !(await canAccessLesson(id, user.id))) return Response.json({ error: "Lesson not found." }, { status: 404 });
  const [lesson] = await db.select({ id: lessons.id, teacherId: lessons.teacherId, startAt: lessons.startAt, duration: lessons.duration, capacity: lessons.capacity, platform: lessons.platform }).from(lessons).where(eq(lessons.id, id)).limit(1);
  if (!lesson || lesson.platform !== "daily") return Response.json({ error: "Daily is not selected for this lesson." }, { status: 409 });
  try {
    const snapshot = await classroomSnapshot(user.id, id, user.name);
    if (snapshot.state !== "open") return Response.json({ error: "The room is not open yet." }, { status: 403 });
    const joinUrl = await createDailyToken({ lesson, userId: user.id, displayName: user.name, isTeacher: lesson.teacherId === user.id });
    return Response.json({ joinUrl }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare a secure video room.";
    return Response.json({ error: message.slice(0, 220) }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
