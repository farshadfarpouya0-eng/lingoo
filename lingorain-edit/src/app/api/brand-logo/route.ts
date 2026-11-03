import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

/** Serves the logo uploaded in Admin → Branding. The ?v= hash changes whenever the logo changes. */
export async function GET() {
  const branding = await getBranding();
  const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/.exec(branding.logoUrl);
  if (!match) return new Response("Not found", { status: 404 });

  const type = match[1];
  const bytes = new Uint8Array(Buffer.from(match[2], "base64"));

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  /* an SVG opened directly must never run scripts */
  if (type === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

  return new Response(bytes, { headers });
}
