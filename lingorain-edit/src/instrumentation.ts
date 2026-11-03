import { embeddedSandboxPreview } from "./lib/preview-frame-policy";

/** The app must not be marked ready while its fresh preview has no tables. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!embeddedSandboxPreview({ E2B_SANDBOX: process.env.E2B_SANDBOX, E2B_SANDBOX_ID: process.env.E2B_SANDBOX_ID, DATABASE_URL: process.env.DATABASE_URL })) return;
  const { ensurePreviewDatabase } = await import("./db/preview-bootstrap");
  await ensurePreviewDatabase();
  const { ensureSeed } = await import("./lib/seed");
  await ensureSeed();
  console.info("[Lingorain preview] Startup completed before serving requests.");
}

/** Log only routing/digest identifiers, never query params or driver credentials. */
export function onRequestError(error: unknown, request: { path: string }, context: { routerKind: string; routeType: string }) {
  const details = error as { digest?: string; code?: string; cause?: { code?: string } } | null;
  console.error("[Lingorain request]", {
    path: request.path.split("?")[0], router: context.routerKind, type: context.routeType,
    reference: details?.digest || "unavailable", code: details?.cause?.code || details?.code || "APP_ERROR",
  });
}
