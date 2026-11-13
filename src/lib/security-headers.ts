import { isVideoHostname } from "./video-provider";
import { embeddedSandboxPreview } from "./preview-frame-policy";

export function approvedVideoHostname(raw?: string) {
  const host = (raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return isVideoHostname(host) ? host : "";
}

export function classroomSecurityHeaders(savedHost?: string) {
  const host = approvedVideoHostname(savedHost || process.env.JITSI_DOMAIN);
  const custom = host ? ` https://${host}` : "";
  const sandbox = embeddedSandboxPreview({ E2B_SANDBOX: process.env.E2B_SANDBOX, E2B_SANDBOX_ID: process.env.E2B_SANDBOX_ID, DATABASE_URL: process.env.DATABASE_URL });
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://8x8.vc https://*.8x8.vc${custom}${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://randomuser.me https://api.dicebear.com https://images.pexels.com",
    "font-src 'self' data:",
    `connect-src 'self' https://8x8.vc https://*.8x8.vc https://*.supabase.co https://*.daily.co wss://*.daily.co${custom}`,
    `frame-src https://8x8.vc https://*.8x8.vc https://*.daily.co${custom}`,
    "worker-src 'self' blob:",
    ...(!sandbox ? ["frame-ancestors 'none'"] : []),
    "base-uri 'self'", "form-action 'self' https://checkout.stripe.com", "object-src 'none'",
  ].join("; ");
  const permissions = ["camera", "microphone", "display-capture"].map(feature => `${feature}=(self "https://8x8.vc" "https://*.8x8.vc" "https://*.daily.co"${host ? ` "https://${host}"` : ""})`).concat("geolocation=()").join(", ");
  return { "Content-Security-Policy": csp, "Permissions-Policy": permissions };
}
