import { eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials, classroomWorkspaceStates } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, privateFileContentType } from "@/lib/private-storage";
import { canAccessLesson } from "@/lib/lesson-access";
import { materialAssetReference } from "@/lib/material-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const [material] = await db.select().from(learningMaterials).where(eq(learningMaterials.id, id));
  if (!material || (!material.published && user.role !== "admin")) return Response.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const lessonId = Number(url.searchParams.get("lesson"));
  if (user.role !== "admin") {
    if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !(await canAccessLesson(lessonId, user.id))) return Response.json({ error: "Classroom access required" }, { status: 403 });
    if (user.role !== "teacher") {
      const [workspace] = await db.select({ state: classroomWorkspaceStates.state }).from(classroomWorkspaceStates).where(eq(classroomWorkspaceStates.lessonId, lessonId)).limit(1);
      const selectedBookId = workspace?.state && typeof workspace.state === "object" ? Number((workspace.state as Record<string, unknown>).bookId) : NaN;
      if (selectedBookId !== id) return Response.json({ error: "This material is not selected for this classroom" }, { status: 403 });
    }
  }
  const asset = url.searchParams.get("asset") || "";
  const unitIndex = Number(url.searchParams.get("unit") || 0);
  const type = url.searchParams.get("type") || "";
  if (asset !== "cover" && asset !== "pdf" && !["audio", "image"].includes(type)) return Response.json({ error: "Not found" }, { status: 404 });
  if (["audio", "image"].includes(type) && (!Number.isSafeInteger(unitIndex) || unitIndex < 0 || unitIndex > 1000)) return Response.json({ error: "Not found" }, { status: 404 });
  const reference = asset === "cover" ? material.coverUrl : materialAssetReference(material, asset === "pdf" ? "pdf" : type, unitIndex);
  if (!reference.startsWith("storage://") || !reference.includes("/materials/")) return Response.json({ error: "This asset is missing. Ask an administrator to re-upload it in Admin → Materials." }, { status: 404 });
  try {
    const upstream = await fetchPrivateFile(reference, req.headers.get("range"));
    const headers = new Headers({ "Content-Type": privateFileContentType(reference), "Content-Disposition": "inline", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes" });
    for (const key of ["content-length", "content-range"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch { return Response.json({ error: "The private file could not be retrieved. Check storage configuration or re-upload the file." }, { status: 502 }); }
}
