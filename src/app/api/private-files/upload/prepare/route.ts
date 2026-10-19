import { getUser } from "@/lib/auth";
import { hit } from "@/lib/ratelimit";
import { createSignedPrivateUpload } from "@/lib/private-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!await hit(`private-upload:${user.id}`, 20, 60 * 60_000)) return Response.json({ error: "Upload preparation limit reached. Try again later." }, { status: 429 });
  let body: { purpose?: unknown; fileName?: unknown; mimeType?: unknown; size?: unknown; materialKind?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const purpose = body.purpose === "material" ? "material" : body.purpose === "document" ? "document" : body.purpose === "avatar" ? "avatar" : "";
  if (!purpose) return Response.json({ error: "Invalid upload purpose." }, { status: 400 });
  if (purpose === "material" && user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  if (purpose === "document" && user.role !== "teacher") return Response.json({ error: "Teacher access required." }, { status: 403 });
  if (purpose === "avatar" && !["student", "teacher"].includes(user.role)) return Response.json({ error: "Student or teacher account required." }, { status: 403 });
  if (typeof body.fileName !== "string" || typeof body.mimeType !== "string" || typeof body.size !== "number") {
    return Response.json({ error: "File details are required." }, { status: 400 });
  }
  if (purpose === "material" && !["textbook", "audio", "worksheet"].includes(String(body.materialKind))) {
    return Response.json({ error: "Select a material type." }, { status: 400 });
  }
  try {
    const ticket = await createSignedPrivateUpload({
      folder: purpose === "material" ? "materials" : purpose === "document" ? "teacher-documents" : "avatars",
      ownerId: user.id,
      kind: purpose === "material" ? "material" : purpose === "document" ? "document" : "avatar",
      fileName: body.fileName,
      mimeType: body.mimeType,
      size: body.size,
      materialKind: typeof body.materialKind === "string" ? body.materialKind : undefined,
    });
    return Response.json(ticket, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to prepare upload." }, { status: 400, headers: { "Cache-Control": "no-store, private" } });
  }
}
