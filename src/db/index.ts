import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Only local development may fall back to a local database. Production, preview and
// build fail loudly if DATABASE_URL is missing instead of silently connecting to localhost.
const databaseUrl = process.env.DATABASE_URL
  || (process.env.NODE_ENV === "development" ? "postgres://postgres:postgres@localhost:5432/postgres" : undefined);
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function integerOption(value: string | undefined, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
const globalForDb = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };

// A tiny pool per warm serverless instance, backed by the provider's pooled
// endpoint. TLS is controlled by the provider's connection-string parameters.
// Do not disable certificate checks for external databases.
export const pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({
  connectionString: databaseUrl,
  max: integerOption(process.env.DB_POOL_MAX, 2, 1, 20),
  connectionTimeoutMillis: integerOption(process.env.DB_CONNECT_TIMEOUT_MS, 15000, 1000, 60000),
  idleTimeoutMillis: 10000,
  allowExitOnIdle: true,
  keepAlive: true,
});
globalForDb.__arenaNextJsPostgresqlPool = pool;
export const db = drizzle(pool);