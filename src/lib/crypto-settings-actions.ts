"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { adminAuditLogs, cryptoNetworkSettings } from "@/db/schema";
import { requireAdmin } from "./auth";
import { CRYPTO_ASSETS, isCryptoAsset, validReceivingAddress } from "./crypto-networks";
import { isCryptoSettingsReady } from "./crypto-settings";

export async function saveCryptoSettings(fd: FormData) {
  const admin = await requireAdmin();
  if (!await isCryptoSettingsReady()) redirect("/admin/crypto-settings?result=setup");
  const updates: (typeof cryptoNetworkSettings.$inferInsert)[] = [];
  for (const asset of Object.keys(CRYPTO_ASSETS)) {
    if (!isCryptoAsset(asset)) continue;
    const address = String(fd.get(`address_${asset}`) || "").trim();
    const directEnabled = fd.get(`direct_${asset}`) === "on";
    if (address && !validReceivingAddress(asset, address)) redirect(`/admin/crypto-settings?result=address&asset=${asset}`);
    if (directEnabled && !address) redirect(`/admin/crypto-settings?result=address_required&asset=${asset}`);
    updates.push({ asset, receiveAddress: address, directEnabled, nowpaymentsEnabled: fd.get(`nowpayments_${asset}`) === "on", plisioEnabled: fd.get(`plisio_${asset}`) === "on", updatedBy: admin.id, updatedAt: new Date() });
  }
  await db.transaction(async tx => {
    for (const values of updates) await tx.insert(cryptoNetworkSettings).values(values).onConflictDoUpdate({ target: cryptoNetworkSettings.asset, set: values });
    await tx.insert(adminAuditLogs).values({ adminId: admin.id, action: "crypto.settings.updated", reference: "crypto-networks", note: "Network availability and public receiving addresses updated.", metadata: { networks: updates.map(item => ({ asset: item.asset, directEnabled: item.directEnabled, nowpaymentsEnabled: item.nowpaymentsEnabled, plisioEnabled: item.plisioEnabled })) } });
  });
  revalidatePath("/admin/crypto-settings"); revalidatePath("/admin/crypto-payments"); revalidatePath("/dashboard");
  redirect("/admin/crypto-settings?result=saved");
}
