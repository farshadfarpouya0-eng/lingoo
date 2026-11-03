import { pool } from "@/db";

/**
 * Crypto payments are an optional feature added by migration 0017. Check the
 * physical table before issuing a Drizzle query against it so the core Wallet
 * page remains usable on deployments that have not applied that migration.
 */
export async function isCryptoPaymentsSchemaReady(): Promise<boolean> {
  try {
    const result = await pool.query<{ ready: boolean }>(
      "select to_regclass('public.crypto_payment_orders') is not null as ready",
    );
    return result.rows[0]?.ready === true;
  } catch {
    return false;
  }
}
