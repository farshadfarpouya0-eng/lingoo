import { getUser } from "@/lib/auth";
import { classroomSnapshot } from "@/lib/room-service";
import { hit } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  if (!await hit(`room-poll:${u.id}`, 180, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });
  try {
    return Response.json(await classroomSnapshot(u.id, id, u.name), { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Not found" }, { status: 404 }); }
}
