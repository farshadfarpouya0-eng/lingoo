import { eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials } from "@/db/schema";
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
  // Standalone material downloads are no longer a student feature. Students
  // receive selected content only through an authorized live classroom.
  if (user.role !== "admin" && user.role !== "teacher") return Response.json({ error: "Not found" }, { status: 404 });
  if (!material || (!material.published && user.role !== "admin")) return Response.json({ error: "Not found" }, { status: 404 });
  // Interactive courses keep lesson metadata in Neon and media in private storage.
  // The individual asset route checks entitlement and only serves references embedded in this material.
  if (material.fileUrl.trim().startsWith("{")) return Response.json({ error: "This is an interactive course; request a protected lesson asset instead." }, { status: 400 });
  // Older rows may contain public URLs. Refuse to redirect because such a URL can
  // bypass purchase gating once shared. Re-upload legacy files to private storage.
  if (!material.fileUrl.startsWith("storage://")) {
    return Response.json({ error: "This is a legacy external file. An administrator must re-upload it to private Lingorain storage." }, { status: 410 });
  }
  try {
    const upstream = await fetchPrivateFile(material.fileUrl, req.headers.get("range"));
    const contentType = privateFileContentType(material.fileUrl);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `${new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="lingorain-material-${material.id}.${privateFileExtension(material.fileUrl)}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Accept-Ranges": "bytes",
    });
    for (const key of ["content-length", "content-range"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "File unavailable" }, { status: 502 }); }
}
