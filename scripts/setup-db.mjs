import { execSync } from "child_process";

// Local/development convenience only. Never push schema or seed data during a
// production build. Hosted production changes must use reviewed SQL migrations.
if (process.env.VERCEL || process.env.NETLIFY || process.env.NODE_ENV === "production") {
  console.error("Refusing to run setup-db in a hosted/production environment. Use the reviewed migration runner and create-admin.ts instead.");
  process.exit(1);
}
if (process.env.ALLOW_SCHEMA_PUSH !== "true") {
  console.error("This script runs drizzle-kit push and seeds a database. Set ALLOW_SCHEMA_PUSH=true only for a disposable local/development DB.");
  process.exit(1);
}
const direct = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!direct) {
  console.error("DATABASE_DIRECT_URL or DATABASE_URL is not set.");
  process.exit(1);
}
try {
  const hostname = new URL(direct).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) && process.env.ALLOW_REMOTE_DEV_DB !== "true") {
    console.error("Refusing to drizzle-kit push to a remote database. Set ALLOW_REMOTE_DEV_DB=true only for an isolated development database.");
    process.exit(1);
  }
} catch {
  console.error("DATABASE_DIRECT_URL/DATABASE_URL is invalid.");
  process.exit(1);
}
process.env.DATABASE_URL = direct;
console.log("[setup-db] Applying schema to a development database...");
execSync("npx drizzle-kit push", { stdio: "inherit" });
console.log("[setup-db] Seeding (admin password is never printed)...");
execSync("npx tsx scripts/seed.mjs --seed-only", { stdio: "inherit" });
console.log("[setup-db] Done.");
