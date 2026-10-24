import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Singleton pool for Neon.
 *
 * Neon's pooler drops idle clients after a few minutes. Without an `error`
 * listener, node-postgres emits an unhandled `'error'` event on the pool,
 * which can kill the Node process and make /admin and /dashboard show
 * "This page could not load".
 */
declare global {
  // eslint-disable-next-line no-var
  var __lingorainPool: Pool | undefined;
}

const envConnectionString = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;

if (!envConnectionString) {
  throw new Error("DATABASE_URL is not set. Add your Neon connection string.");
}

// Narrowed non-optional value captured for use in the factory below.
const connectionString: string = envConnectionString;

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 25_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: false,
    ssl: connectionString.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });

  // Never let a dropped idle connection crash the server process.
  pool.on("error", (err) => {
    console.error("[pg pool] idle client error:", err.message);
  });

  return pool;
}

if (!global.__lingorainPool) {
  global.__lingorainPool = createPool();
}

export const pool = global.__lingorainPool;
export const db = drizzle(pool, { schema });
export type DB = typeof db;
