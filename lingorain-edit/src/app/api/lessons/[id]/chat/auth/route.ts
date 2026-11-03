import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { signPusherPrivateChannel } from "@/lib/realtime-pusher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1 || !(await canAccessLesson(id, user.id))) return Response.json({ error: "Not found" }, { status: 404 });
  let body: { socket_id?: unknown; channel_name?: unknown };
  try { body = await req.json() as typeof body; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body.channel_name !== `private-lesson-${id}` || typeof body.socket_id !== "string") return Response.json({ error: "Invalid channel" }, { status: 403 });
  try {
    const snapshot = await classroomSnapshot(user.id, id, user.name);
    if (snapshot.state !== "open") return Response.json({ error: "Classroom is closed" }, { status: 403 });
    const auth = await signPusherPrivateChannel(body.socket_id, body.channel_name);
    return Response.json({ auth }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Realtime authentication unavailable" }, { status: 503 }); }
}
