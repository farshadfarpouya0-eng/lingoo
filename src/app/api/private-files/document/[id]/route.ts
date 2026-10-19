import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherDocuments } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, privateFileContentType, privateFileExtension } from "@/lib/private-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const [doc] = await db.select().from(teacherDocuments).where(eq(teacherDocuments.id, id));
  if (!doc || (user.role !== "admin" && user.id !== doc.teacherId)) return Response.json({ error: "Not found" }, { status: 404 });
  // Legacy links did not prove privacy. Do not redirect identity documents to a potentially public host.
  if (!doc.fileUrl.startsWith("storage://")) return Response.json({ error: "This is a legacy external document link. Remove it and re-submit the file through private upload." }, { status: 410 });
  try {
    const upstream = await fetchPrivateFile(doc.fileUrl, req.headers.get("range"));
    const contentType = privateFileContentType(doc.fileUrl);
    const ext = privateFileExtension(doc.fileUrl);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="teacher-document-${doc.id}.${ext}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    for (const key of ["content-length", "content-range"]) { const value = upstream.headers.get(key); if (value) headers.set(key, value); }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Document unavailable" }, { status: 502 }); }
}
