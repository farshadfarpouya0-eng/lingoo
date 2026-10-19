import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fetchPrivateFile, privateFileContentType, privateFileExtension, parsePrivateStorageRef } from "@/lib/private-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Profile pictures are intentionally public; the underlying storage bucket remains private. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response("Not found", { status: 404 });
  const [user] = await db.select({ ref: users.avatarStorageRef }).from(users).where(eq(users.id, id));
  const ref = user?.ref;
  const parsed = ref ? parsePrivateStorageRef(ref) : null;
  if (!ref || !parsed || !parsed.key.startsWith(`avatars/${id}/`)) return new Response("Not found", { status: 404 });
  const ext = privateFileExtension(ref);
  if (!["jpg", "png", "webp"].includes(ext)) return new Response("Not found", { status: 404 });
  try {
    const upstream = await fetchPrivateFile(ref);
    const headers = new Headers({
      "Content-Type": privateFileContentType(ref),
      "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return new Response("Avatar unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
