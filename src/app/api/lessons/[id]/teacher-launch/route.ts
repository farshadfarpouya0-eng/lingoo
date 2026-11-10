import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { resolveTeacherLaunch } from "@/lib/teacher-launch";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const MESSAGES: Record<string, string> = {
  meet_setup: "No Google Meet room is assigned. Ask the administrator to add one in Admin → Tutors.",
  meet_open_access: "This Meet room is not marked Open/guest-friendly. Ask the administrator to enable Open access so the teacher does not need to sign in.",
  zoom_setup: "Zoom no-login launch is not ready. Ask the administrator to connect Zoom in Admin → Integrations, or save a valid Zoom host/start link for this tutor.",
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Lesson not found." }, { status: 404, headers });
  if (!await hit(`teacher-launch:${user.id}`, 30, 60_000)) return Response.json({ error: "Please wait a moment." }, { status: 429, headers });
  try {
    const [lesson] = await db.select({ teacherId: lessons.teacherId, platform: lessons.platform, meetingUrl: lessons.meetingUrl, topic: lessons.topic }).from(lessons).where(eq(lessons.id, id)).limit(1);
    if (!lesson || !(await canAccessLesson(id, user.id))) return Response.json({ error: "Lesson not found." }, { status: 404, headers });
    const adminSandbox = user.role === "admin" && lesson.topic.startsWith("[TEST]");
    if (user.id !== lesson.teacherId && !adminSandbox) return Response.json({ error: "Only the tutor can launch the host room." }, { status: 403, headers });
    const snapshot = await classroomSnapshot(user.id, id, user.name);
    if (snapshot.state !== "open") return Response.json({ error: "The classroom is not open yet." }, { status: 403, headers });
    if (snapshot.platform !== "meet" && snapshot.platform !== "zoom") return Response.json({ error: "This lesson is not using Google Meet or Zoom." }, { status: 409, headers });
    const launch = await resolveTeacherLaunch(lesson.teacherId, snapshot.platform, lesson.meetingUrl);
    return Response.json(launch, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (MESSAGES[code]) return Response.json({ error: MESSAGES[code], code }, { status: 409, headers });
    if (code === "forbidden") return Response.json({ error: "Access denied." }, { status: 403, headers });
    return Response.json({ error: "Could not prepare the teacher launch link. Ask the administrator to check the room settings." }, { status: 503, headers });
  }
}
