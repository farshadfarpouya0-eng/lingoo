import { createHash } from "node:crypto";
import { getIntegrationConfig } from "./integration-config";

export async function sendTransactionalEmail(input: { to: string; subject: string; text: string }) {
  const cfg = await getIntegrationConfig();
  if (!cfg.email.apiKey || !cfg.email.from) throw new Error("email_not_configured");
  const key = createHash("sha256").update(`${input.to}:${input.subject}:${input.text}`).digest("hex");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.email.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ from: cfg.email.from, to: [input.to], subject: input.subject, text: input.text }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`email_provider_error_${response.status}:${body.slice(0, 300)}`);
  }
  return await response.json().catch(() => ({}));
}

export function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("APP_URL_must_use_https");
    return url.origin;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("APP_URL_not_configured");
}
