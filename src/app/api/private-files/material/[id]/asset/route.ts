import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials, materialPurchases } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, privateFileContentType, privateFileExtension } from "@/lib/private-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const [material] = await db.select().from(learningMaterials).where(eq(learningMaterials.id, id));
  if (!material || (!material.published && user.role !== "admin")) return Response.json({ error: "Not found" }, { status: 404 });
  if (user.role !== "admin" && user.role !== "teacher" && !material.isFree) {
    const [purchase] = await db.select({ id: materialPurchases.id }).from(materialPurchases).where(and(eq(materialPurchases.materialId, id), eq(materialPurchases.userId, user.id), eq(materialPurchases.status, "paid")));
    if (!purchase) return Response.json({ error: "Purchase required" }, { status: 403 });
  }
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset");
  let reference = "";
  if (asset === "cover") reference = material.coverUrl || "";
  else {
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
