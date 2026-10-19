type PreviewEnvironment = { E2B_SANDBOX?: string; E2B_SANDBOX_ID?: string; DATABASE_URL?: string };

/**
 * The builder embeds its disposable E2B preview inside another origin.
 * Permit this only inside an actual E2B sandbox backed by local test Postgres.
 * Hosted customer environments retain clickjacking protection by default.
 */
export function embeddedSandboxPreview(env: PreviewEnvironment) {
  if (!env.E2B_SANDBOX && !env.E2B_SANDBOX_ID) return false;
  try {
    const host = new URL(env.DATABASE_URL || "").hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  } catch { return false; }
}
