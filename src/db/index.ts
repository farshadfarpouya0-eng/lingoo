import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Serverless-friendly singleton pool for Neon.
 * - small max so many Vercel instances do not exhaust Neon's connection limit
 * - short connection/statement timeouts so a stuck query cannot hang a page for 30s
 * - error listener so Neon dropping an idle client never crashes the process
 */
declare global {
  // eslint-disable-next-line no-var
  var __lingorainPool: Pool | undefined;
}

const envConnectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!envConnectionString) throw new Error("DATABASE_URL is not set.");

const connectionString: string = envConnectionString;

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    query_timeout: 10_000,
    keepAlive: true,
    allowExitOnIdle: true,
    ssl: connectionString.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });
  pool.on("error", (err) => console.error("[pg pool] idle client error:", err.message));
  return pool;
}

if (!global.__lingorainPool) global.__lingorainPool = createPool();

export const pool = global.__lingorainPool;
export const db = drizzle(pool, { schema });
export type DB = typeof db;
