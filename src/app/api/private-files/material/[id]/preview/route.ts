import { eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, privateFileContentType } from "@/lib/private-storage";
import { materialAssetReference } from "@/lib/material-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Teacher-only preview of published admin materials; never touches a real lesson workspace. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "teacher") return Response.json({ error: "Teacher access required" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const [material] = await db.select().from(learningMaterials).where(eq(learningMaterials.id, id)).limit(1);
  if (!material || !material.published) return Response.json({ error: "Published material not found" }, { status: 404 });
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset") || "";
  const unitIndex = Number(url.searchParams.get("unit") || 0);
  if (!["cover", "pdf", "audio", "image"].includes(asset)) return Response.json({ error: "Not found" }, { status: 404 });
  if (["audio", "image"].includes(asset) && (!Number.isSafeInteger(unitIndex) || unitIndex < 0 || unitIndex > 1000)) return Response.json({ error: "Not found" }, { status: 404 });
  const reference = asset === "cover" ? material.coverUrl : materialAssetReference(material, asset, unitIndex);
  if (!reference.startsWith("storage://") || !reference.includes("/materials/")) return Response.json({ error: "This material asset is unavailable. Ask an administrator to re-upload it to private storage." }, { status: 404 });
  try {
    const upstream = await fetchPrivateFile(reference, req.headers.get("range"));
    const headers = new Headers({ "Content-Type": privateFileContentType(reference), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes" });
    for (const key of ["content-length", "content-range"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch { return Response.json({ error: "Preview file unavailable. Check private storage or re-upload the asset." }, { status: 502 }); }
}
