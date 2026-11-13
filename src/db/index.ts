import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The database client is created on first use instead of at import time.
 *
 * A hosted build imports this module while collecting route configuration. Creating
 * the pool eagerly made every build fail with "DATABASE_URL is required" whenever the
 * variable was not visible to that deployment (for example a Vercel Preview build).
 * The runtime behaviour is unchanged: the connection string is still required, and a
 * real query without it fails with the same clear message.
 */
type Database = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: Database;
};

function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({ connectionString: databaseUrl });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

function getDb(): Database {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve() as unknown as Record<PropertyKey, unknown>;
      const value = instance[property];
      return typeof value === "function" ? value.bind(instance) : value;
    },
    has(_target, property) {
      return property in (resolve() as unknown as object);
    },
    set(_target, property, value) {
      (resolve() as unknown as Record<PropertyKey, unknown>)[property] = value;
      return true;
    },
  });
}

export const pool: Pool = lazyProxy<Pool>(getPool);

export const db: Database = lazyProxy<Database>(getDb);
