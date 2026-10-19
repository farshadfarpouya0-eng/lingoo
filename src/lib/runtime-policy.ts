/** Server-only deployment policy. Do not pass environment values to clients. */
export function localDatabaseConfigured() {
  try {
    const hostname = new URL(process.env.DATABASE_URL || "").hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch { return false; }
}
function demoAllowed(flag: string | undefined) {
  // Demo users share a published password. Never enable that fixture against a
  // hosted database, even if an environment variable is misconfigured.
  if (!localDatabaseConfigured()) return false;
  return flag !== "false";
}
export function demoDataEnabled() { return demoAllowed(process.env.ENABLE_DEMO_DATA); }
export function demoPaymentsEnabled() { return demoAllowed(process.env.ENABLE_DEMO_PAYMENTS); }
export function classroomSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (localDatabaseConfigured()) return process.env.DATABASE_URL || "local-classroom-only";
  throw new Error("A stable SESSION_SECRET of at least 32 characters is required for hosted classrooms.");
}
