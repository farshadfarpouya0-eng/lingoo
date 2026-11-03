import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomWorkspaceStates, learningMaterials } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

/** Returns only the single published material currently selected by the tutor. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !(await canAccessLesson(lessonId, user.id))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const room = await classroomSnapshot(user.id, lessonId, user.name);
    if (room.state !== "open") return Response.json({ error: "Classroom is not open" }, { status: 403 });
  } catch {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!await hit(`classroom-material:${user.id}`, 90, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });

  const [workspace] = await db.select({ state: classroomWorkspaceStates.state })
    .from(classroomWorkspaceStates).where(eq(classroomWorkspaceStates.lessonId, lessonId)).limit(1);
  const selectedId = workspace?.state && typeof workspace.state === "object"
    ? Number((workspace.state as Record<string, unknown>).bookId)
    : NaN;
  if (!Number.isSafeInteger(selectedId) || selectedId < 1) return Response.json({ material: null });

  const [material] = await db.select({
    id: learningMaterials.id,
    title: learningMaterials.title,
    kind: learningMaterials.kind,
    category: learningMaterials.category,
    language: learningMaterials.language,
    level: learningMaterials.level,
    fileUrl: learningMaterials.fileUrl,
    coverUrl: learningMaterials.coverUrl,
    description: learningMaterials.description,
  }).from(learningMaterials)
    .where(and(eq(learningMaterials.id, selectedId), eq(learningMaterials.published, true))).limit(1);

  return Response.json({ material: material || null }, { headers: { "Cache-Control": "private, no-store" } });
}
