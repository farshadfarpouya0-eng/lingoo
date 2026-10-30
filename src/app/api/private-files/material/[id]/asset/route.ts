import { eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials, classroomWorkspaceStates } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, privateFileContentType, privateFileExtension } from "@/lib/private-storage";
import { canAccessLesson } from "@/lib/lesson-access";

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
  const demoAccess = url.searchParams.get("demo") === "1" && user.role === "teacher";
  if (user.role !== "admin" && !demoAccess) {
    if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !(await canAccessLesson(lessonId, user.id))) {
      return Response.json({ error: "Classroom access required" }, { status: 403 });
    }
    if (user.role !== "teacher") {
      const [workspace] = await db.select({ state: classroomWorkspaceStates.state }).from(classroomWorkspaceStates).where(eq(classroomWorkspaceStates.lessonId, lessonId)).limit(1);
      const selectedBookId = workspace?.state && typeof workspace.state === "object" ? Number((workspace.state as Record<string, unknown>).bookId) : NaN;
      if (selectedBookId !== id) return Response.json({ error: "This material is not selected for this classroom" }, { status: 403 });
    }
  }
  const asset = url.searchParams.get("asset");
  let reference = "";
  if (asset === "cover") reference = material.coverUrl || "";
  else if (asset === "pdf") {
    try { const parsed = JSON.parse(material.fileUrl); reference = String(parsed.pdfRef || ""); } catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  } else {
    const unitIndex = Number(url.searchParams.get("unit"));
    const type = url.searchParams.get("type");
    if (!Number.isSafeInteger(unitIndex) || unitIndex < 0 || !["audio", "image"].includes(type || "")) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      const parsed = JSON.parse(material.fileUrl);
      const unit = Array.isArray(parsed.units) ? parsed.units[unitIndex] : null;
      reference = type === "audio" ? String(unit?.audioRef || "") : String(unit?.imageRef || "");
    } catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  }
  if (!reference.startsWith("storage://") || !reference.includes("/materials/")) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const upstream = await fetchPrivateFile(reference, req.headers.get("range"));
    const headers = new Headers({ "Content-Type": privateFileContentType(reference), "Content-Disposition": "inline", "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes" });
    for (const key of ["content-length", "content-range"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "File unavailable" }, { status: 502 }); }
}
