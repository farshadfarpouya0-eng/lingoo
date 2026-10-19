import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set DATABASE_DIRECT_URL (preferred) or DATABASE_URL.");
  process.exit(1);
}
const url = new URL(connectionString);
const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
if (!isLocal && process.env.ALLOW_PRODUCTION_MIGRATIONS !== "true") {
  console.error("Refusing to modify a hosted database without ALLOW_PRODUCTION_MIGRATIONS=true. Back up the DB and run this from a controlled release environment.");
  process.exit(1);
}

const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 60_000 });
try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS lingorain_schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const dir = join(process.cwd(), "drizzle");
  const files = (await readdir(dir)).filter(name => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
  for (const file of files) {
    const [applied] = (await client.query("SELECT version FROM lingorain_schema_migrations WHERE version = $1", [file])).rows;
    if (applied) {
      console.log(`[migrate] skipped ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(dir, file), "utf8");
    console.log(`[migrate] applying ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO lingorain_schema_migrations(version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[migrate] applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
  console.log("[migrate] all migrations applied");
} catch (error) {
  console.error("[migrate] failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
