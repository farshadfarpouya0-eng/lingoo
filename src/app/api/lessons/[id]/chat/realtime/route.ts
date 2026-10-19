import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { getPusherPublicConfig } from "@/lib/realtime-pusher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ enabled: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1 || !(await canAccessLesson(id, user.id))) return Response.json({ enabled: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const room = await classroomSnapshot(user.id, id, user.name);
    if (room.state !== "open") return Response.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
    const config = await getPusherPublicConfig();
    return Response.json(config ? { enabled: true, ...config, channel: `private-lesson-${id}` } : { enabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ enabled: false }, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
