import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot, jitsiRoomName } from "@/lib/room-service";
import { getIntegrationConfig } from "@/lib/integration-config";
import { createJitsiTicket } from "@/lib/jitsi-video";
import { resolveVideoProvider, VIDEO_SETUP_MESSAGE } from "@/lib/video-provider";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in to join this lesson." }, { status: 401, headers });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Lesson not found." }, { status: 404, headers });
  if (!await hit(`video-token:${user.id}`, 30, 60_000)) return Response.json({ error: "Please wait a moment before reconnecting." }, { status: 429, headers });
  try {
    // Recheck membership, suspension, admin sandbox, platform and lesson window on every issuance.
    const snapshot = await classroomSnapshot(user.id, id, user.name);
    if (snapshot.state !== "open") return Response.json({ error: snapshot.state === "pending" ? "The tutor must confirm the booking before anyone can enter." : "The classroom is not open yet.", code: "entry_closed" }, { status: 403, headers });
    if (snapshot.platform !== "lingo") return Response.json({ error: "LingoRoom is not selected for this lesson." }, { status: 409, headers });
    if (snapshot.videoProvider === "unconfigured") return Response.json({ error: VIDEO_SETUP_MESSAGE, code: "video_not_configured" }, { status: 503, headers });
    const [lesson] = await db.select({ teacherId: lessons.teacherId, startAt: lessons.startAt, duration: lessons.duration }).from(lessons).where(eq(lessons.id, id)).limit(1);
    if (!lesson || !(await canAccessLesson(id, user.id))) return Response.json({ error: "You are not a participant in this lesson." }, { status: 403, headers });
    const cfg = await getIntegrationConfig();
    if (resolveVideoProvider(cfg.video) !== snapshot.videoProvider) return Response.json({ error: "The video configuration changed. Reload the classroom and try again." }, { status: 409, headers });
    const ticket = createJitsiTicket({
      video: cfg.video,
      room: jitsiRoomName(id),
      userId: user.id,
      displayName: user.name,
      // classroomSnapshot above restricts admins to [TEST] sandbox lessons only.
      isTeacher: user.id === lesson.teacherId || user.role === "admin",
      lessonEndsAt: new Date(lesson.startAt.getTime() + lesson.duration * 60_000),
    });
    return Response.json(ticket, { headers });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") return Response.json({ error: "You are not a participant in this lesson." }, { status: 403, headers });
    // Do not return database errors, signing material, or provider credentials to the browser.
    return Response.json({ error: "Could not authorize the video room. Check the video integration and try again." }, { status: 503, headers });
  }
}
