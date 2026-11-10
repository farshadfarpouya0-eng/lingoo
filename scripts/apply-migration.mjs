// Apply exactly ONE migration file, safely, without replaying older migrations.
//
// Why: if a database was migrated before the lingorain_schema_migrations ledger existed,
// `run-migrations.mjs` would replay 0000..N. Some older files change data (for example 0016
// shifts lesson timestamps), so replaying them can corrupt production data.
//
// Usage (Git Bash):
//   node scripts/apply-migration.mjs --status
//   node scripts/apply-migration.mjs 0018_crypto_network_settings.sql
// Hosted databases additionally require ALLOW_PRODUCTION_MIGRATIONS=true.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const PREREQUISITES = {
  "0018_crypto_network_settings.sql": ["users", "crypto_payment_orders"],
  "0019_teacher_meeting_links.sql": ["teacher_profiles"],
  "0020_teacher_guest_launch.sql": ["teacher_profiles"],
};

const arg = process.argv[2] || "";
const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) { console.error("Set DATABASE_DIRECT_URL (preferred) or DATABASE_URL first."); process.exit(1); }
let url;
try { url = new URL(connectionString); } catch { console.error("DATABASE_URL is not a valid connection URL."); process.exit(1); }
const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
console.log(`[migrate] target host: ${url.hostname} / database: ${url.pathname.replace(/^\//, "")}`);

const applying = !!arg && arg !== "--status";
if (applying && !isLocal && process.env.ALLOW_PRODUCTION_MIGRATIONS !== "true") {
  // Checked before connecting, so nothing is touched without explicit consent.
  console.error("[migrate] Refusing to change a hosted database. Back up first, then set ALLOW_PRODUCTION_MIGRATIONS=true for this command only.");
  process.exit(1);
}

const client = new Client({ connectionString, connectionTimeoutMillis: 15_000, statement_timeout: 60_000 });
const tableExists = async name => (await client.query("select to_regclass($1) is not null as ok", [`public.${name}`])).rows[0].ok;

try {
  await client.connect();
  if (arg === "--status" || !arg) {
    const ledger = await tableExists("lingorain_schema_migrations");
    console.log(`[status] migration ledger present: ${ledger}`);
    if (ledger) {
      const rows = (await client.query("select version, applied_at from lingorain_schema_migrations order by version")).rows;
      for (const row of rows) console.log(`  applied  ${row.version}  ${row.applied_at.toISOString()}`);
    }
    for (const table of ["users", "lessons", "crypto_payment_orders", "crypto_network_settings"]) console.log(`[status] table ${table}: ${await tableExists(table) ? "present" : "MISSING"}`);
    if (!arg) console.log("\nTo apply one file: node scripts/apply-migration.mjs 0018_crypto_network_settings.sql");
    process.exit(0);
  }
  if (!/^\d{4}_[a-z0-9_-]+\.sql$/i.test(arg)) throw new Error("Pass a single migration filename, e.g. 0018_crypto_network_settings.sql");
  if (!isLocal && process.env.ALLOW_PRODUCTION_MIGRATIONS !== "true") {
    throw new Error("Refusing to change a hosted database. Back up first, then set ALLOW_PRODUCTION_MIGRATIONS=true for this command only.");
  }
  for (const table of PREREQUISITES[arg] || []) {
    if (!await tableExists(table)) throw new Error(`Prerequisite table '${table}' is missing. Apply the earlier migration that creates it first (for crypto: 0017_crypto_payments.sql).`);
  }
  const sql = await readFile(join(process.cwd(), "drizzle", arg), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS lingorain_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const already = (await client.query("select 1 from lingorain_schema_migrations where version = $1", [arg])).rowCount;
    if (already) { await client.query("ROLLBACK"); console.log(`[migrate] ${arg} is already recorded as applied. Nothing to do.`); process.exit(0); }
    await client.query(sql);
    await client.query("INSERT INTO lingorain_schema_migrations(version) VALUES ($1)", [arg]);
    await client.query("COMMIT");
    console.log(`[migrate] applied ${arg} successfully. No wallet balances or existing orders were modified.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
} catch (error) {
  console.error("[migrate] failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
