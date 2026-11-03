import type { NextConfig } from "next";
import { embeddedSandboxPreview } from "./src/lib/preview-frame-policy";

const isProd = process.env.NODE_ENV === "production";
const sandboxPreview = embeddedSandboxPreview({
  E2B_SANDBOX: process.env.E2B_SANDBOX,
  E2B_SANDBOX_ID: process.env.E2B_SANDBOX_ID,
  DATABASE_URL: process.env.DATABASE_URL,
});
const jitsiHost = process.env.JITSI_DOMAIN?.replace(/[^a-z0-9.-]/gi, "");
const supabaseOrigin = (() => {
  try { return new URL(process.env.SUPABASE_URL || "").origin; } catch { return ""; }
})();
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://meet.jit.si https://8x8.vc https://*.jit.si https://*.8x8.vc${jitsiHost ? ` https://${jitsiHost}` : ""}${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://randomuser.me https://api.dicebear.com https://images.pexels.com",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co https://*.daily.co wss://*.daily.co${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  `frame-src https://meet.jit.si https://8x8.vc https://*.jit.si https://*.8x8.vc https://*.daily.co${jitsiHost ? ` https://${jitsiHost}` : ""}`,
  ...(!sandboxPreview ? ["frame-ancestors 'none'"] : []),
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  /* ⭐ smaller server bundles — drizzle-orm is the heaviest import */
  experimental: {
    optimizePackageImports: ["drizzle-orm"],
  },
  /* ⭐ modern image formats + cache for remote avatars */
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "randomuser.me" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          ...(!sandboxPreview ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: ["camera", "microphone", "display-capture"].map(feature => `${feature}=(self \"https://meet.jit.si\" \"https://8x8.vc\" \"https://*.jit.si\" \"https://*.8x8.vc\" \"https://*.daily.co\"${jitsiHost ? ` \"https://${jitsiHost}\"` : ""})`).concat("geolocation=()").join(", ") },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};
export default nextConfig;
