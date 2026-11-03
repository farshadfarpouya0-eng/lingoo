import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";

export const dynamic = "force-dynamic";

/** Retired: in-memory media uploads were not durable across Vercel instances.
 * Use the authenticated, durable lesson workspace/private-storage API instead.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId) || !(await canAccessLesson(lessonId, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ error: "legacy_media_retired", replacement: "/api/lessons/[id]/workspace" }, { status: 410 });
}
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId) || !(await canAccessLesson(lessonId, user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ error: "legacy_media_retired", replacement: "/api/lessons/[id]/workspace" }, { status: 410 });
}
