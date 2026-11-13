import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { classroomSecurityHeaders, approvedVideoHostname } from "@/lib/security-headers";

/**
 * Admin-saved video hosts are runtime data, not build-time environment variables.
 * Only the validated public hostname is read here; credentials never enter headers.
 * Next.js Proxy runs in Node.js, so it can use the existing Drizzle connection.
 */
export async function proxy(_request: NextRequest) {
  let domain = "";
  try {
    const [row] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, "integration_config")).limit(1);
    const saved = row?.value as { publicConfig?: { jitsiDomain?: unknown } } | undefined;
    if (typeof saved?.publicConfig?.jitsiDomain === "string") domain = approvedVideoHostname(saved.publicConfig.jitsiDomain);
  } catch { /* The existing env allowlist remains in effect if the database is unavailable. */ }
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(classroomSecurityHeaders(domain))) response.headers.set(name, value);
  return response;
}

// CSP belongs to the top-level document. Next.js client navigation does not
// replace that policy, so every HTML entry page needs the same public video host.
// Static files and API calls do not need the extra settings query.
export const config = { matcher: ["/((?!api(?:/|$)|_next/|images/|downloads/|pdf-assets/|.*\\.[a-zA-Z0-9]+$).*)"] };
