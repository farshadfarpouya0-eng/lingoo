import { eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, privateFileContentType } from "@/lib/private-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

/**
 * Teacher-only preview endpoint for the isolated LingoRoom Demo.
 * It serves only published Admin materials from the private materials bucket;
 * it never creates or modifies a real lesson or classroom workspace.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "teacher") return Response.json({ error: "Teacher access required" }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const [material] = await db.select().from(learningMaterials).where(eq(learningMaterials.id, id)).limit(1);
  if (!material || !material.published) return Response.json({ error: "Published material not found" }, { status: 404 });

  const url = new URL(req.url);
  const asset = url.searchParams.get("asset");
  let reference = "";

  if (asset === "cover") {
    reference = material.coverUrl || "";
  } else if (asset === "pdf") {
    try {
      const parsed = JSON.parse(material.fileUrl);
      reference = typeof parsed.pdfRef === "string" ? parsed.pdfRef : "";
    } catch {
      const directRef = material.fileUrl.trim();
      if (["textbook", "worksheet"].includes(material.kind) && directRef.startsWith("storage://") && directRef.toLowerCase().endsWith(".pdf")) reference = directRef;
    }
  } else if (["audio", "image"].includes(asset || "")) {
    const unitIndex = Number(url.searchParams.get("unit"));
    if (!Number.isSafeInteger(unitIndex) || unitIndex < 0) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      const parsed = JSON.parse(material.fileUrl);
      const unit = Array.isArray(parsed.units) ? parsed.units[unitIndex] : null;
      reference = asset === "audio" ? String(unit?.audioRef || "") : String(unit?.imageRef || "");
    } catch {
      const directRef = material.fileUrl.trim();
      if (asset === "audio" && unitIndex === 0 && material.kind === "audio" && directRef.startsWith("storage://") && /\.(mp3|wav|ogg|m4a|aac)$/i.test(directRef)) reference = directRef;
    }
  }

  if (!reference.startsWith("storage://") || !reference.includes("/materials/")) {
    return Response.json({ error: "This material asset is unavailable. Ask an administrator to re-upload it to private storage." }, { status: 404 });
  }

  try {
    const upstream = await fetchPrivateFile(reference, req.headers.get("range"));
    const headers = new Headers({
      "Content-Type": privateFileContentType(reference),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Accept-Ranges": "bytes",
    });
    for (const key of ["content-length", "content-range"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Preview file unavailable" }, { status: 502 });
  }
}
