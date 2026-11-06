import { sql } from "drizzle-orm";
import { db } from "@/db";
import { cryptoNetworkSettings } from "@/db/schema";
import { getIntegrationConfig } from "./integration-config";
import { CRYPTO_ASSETS, type CryptoAsset } from "./crypto-networks";

export type CryptoNetworkOption = {
  asset: CryptoAsset; label: string; coin: string; network: string;
  directEnabled: boolean; nowpaymentsEnabled: boolean; plisioEnabled: boolean;
  address: string; managed: boolean;
};
export async function isCryptoSettingsReady() {
  try {
    const result = await db.execute(sql`select to_regclass('public.crypto_network_settings') is not null as ready`);
    return (result.rows[0] as { ready?: boolean } | undefined)?.ready === true;
  } catch { return false; }
}
/** Existing integration addresses remain usable until an admin explicitly saves a network row. */
export async function getCryptoNetworkOptions(): Promise<CryptoNetworkOption[]> {
  const [cfg, rows] = await Promise.all([getIntegrationConfig(), db.select().from(cryptoNetworkSettings)]);
  return (Object.entries(CRYPTO_ASSETS) as [CryptoAsset, typeof CRYPTO_ASSETS[CryptoAsset]][]).map(([asset, meta]) => {
    const row = rows.find(item => item.asset === asset);
    const legacyAddress = cfg.crypto[meta.directKey];
    return {
      asset, label: meta.label, coin: meta.coin, network: meta.network,
      directEnabled: row ? row.directEnabled : !!legacyAddress,
      nowpaymentsEnabled: row?.nowpaymentsEnabled ?? true,
      plisioEnabled: row?.plisioEnabled ?? true,
      address: row ? row.receiveAddress : legacyAddress,
      managed: !!row,
    };
  });
}
