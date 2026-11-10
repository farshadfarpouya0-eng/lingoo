import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { accountingEntries, cryptoNetworkSettings, cryptoPaymentOrders, transactions, users } from "../src/db/schema";
import { updateProviderPayment } from "../src/lib/crypto-payment-settlement";
import { getCryptoNetworkOptions } from "../src/lib/crypto-settings";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";

test("network settings and provider settlement are persistent, guarded and idempotent", async () => {
  assert.equal(localDatabaseConfigured(), true, "Use only the disposable local database.");
  const suffix = randomUUID();
  const [student] = await db.insert(users).values({ name: "Crypto fixture", email: `crypto-${suffix}@example.test`, passwordHash: "fixture-no-login", role: "student", balance: 0 }).returning();
  const [originalSetting] = await db.select().from(cryptoNetworkSettings).where(eq(cryptoNetworkSettings.asset, "usdt_trc20")).limit(1);
  const orderIds: number[] = [];
  try {
    const address = "T" + "A".repeat(33);
    await db.insert(cryptoNetworkSettings).values({ asset: "usdt_trc20", directEnabled: true, receiveAddress: address, nowpaymentsEnabled: true, plisioEnabled: false }).onConflictDoUpdate({ target: cryptoNetworkSettings.asset, set: { directEnabled: true, receiveAddress: address, nowpaymentsEnabled: true, plisioEnabled: false } });
    let options = await getCryptoNetworkOptions();
    assert.equal(options.find(option => option.asset === "usdt_trc20")?.directEnabled, true);
    assert.equal(options.find(option => option.asset === "usdt_trc20")?.plisioEnabled, false);
    await db.update(cryptoNetworkSettings).set({ directEnabled: false }).where(eq(cryptoNetworkSettings.asset, "usdt_trc20"));
    options = await getCryptoNetworkOptions();
    assert.equal(options.find(option => option.asset === "usdt_trc20")?.directEnabled, false);

    const [nowOrder] = await db.insert(cryptoPaymentOrders).values({ userId: student.id, method: "provider", provider: "nowpayments", asset: "usdt_trc20", network: "TRON · TRC20", amountUsd: 2000, payAmount: "20.000000", providerPaymentId: `now-${suffix}`, status: "pending" }).returning();
    orderIds.push(nowOrder.id);
    await updateProviderPayment({ id: nowOrder.id, provider: "nowpayments", providerPaymentId: nowOrder.providerPaymentId, status: "finished", paidAmount: "19.999999" });
    assert.equal((await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, nowOrder.id)))[0].status, "partially_paid");
    assert.equal((await db.select().from(users).where(eq(users.id, student.id)))[0].balance, 0);
    await updateProviderPayment({ id: nowOrder.id, provider: "nowpayments", providerPaymentId: nowOrder.providerPaymentId, status: "finished", paidAmount: "20.000000" });
    await updateProviderPayment({ id: nowOrder.id, provider: "nowpayments", providerPaymentId: nowOrder.providerPaymentId, status: "finished", paidAmount: "20.000000" });
    assert.equal((await db.select().from(users).where(eq(users.id, student.id)))[0].balance, 2000);
    assert.equal((await db.select().from(transactions).where(eq(transactions.ref, `crypto:nowpayments:${nowOrder.id}`))).length, 1);

    const [plisioOrder] = await db.insert(cryptoPaymentOrders).values({ userId: student.id, method: "provider", provider: "plisio", asset: "usdt_bep20", network: "BNB Smart Chain · BEP20", amountUsd: 5000, payAmount: "50.000000", providerPaymentId: `plisio-${suffix}`, status: "pending" }).returning();
    orderIds.push(plisioOrder.id);
    await updateProviderPayment({ id: plisioOrder.id, provider: "plisio", providerPaymentId: plisioOrder.providerPaymentId, status: "completed" });
    assert.equal((await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, plisioOrder.id)))[0].status, "partially_paid", "completion without a verified amount must not credit");
    assert.equal((await db.select().from(users).where(eq(users.id, student.id)))[0].balance, 2000);
    await updateProviderPayment({ id: plisioOrder.id, provider: "plisio", providerPaymentId: plisioOrder.providerPaymentId, status: "confirming" });
    assert.equal((await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, plisioOrder.id)))[0].status, "partially_paid", "progress callbacks must not erase underpayment");
    await updateProviderPayment({ id: plisioOrder.id, provider: "plisio", providerPaymentId: plisioOrder.providerPaymentId, status: "mismatch", paidAmount: "50.500000" });
    assert.equal((await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, plisioOrder.id)))[0].status, "paid", "Plisio overpayment settles once at the requested USD amount");
    assert.equal((await db.select().from(users).where(eq(users.id, student.id)))[0].balance, 7000);
  } finally {
    const txs = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, student.id));
    if (txs.length) await db.delete(accountingEntries).where(inArray(accountingEntries.transactionId, txs.map(tx => tx.id)));
    await db.delete(transactions).where(eq(transactions.userId, student.id));
    if (orderIds.length) await db.delete(cryptoPaymentOrders).where(inArray(cryptoPaymentOrders.id, orderIds));
    await db.delete(users).where(eq(users.id, student.id));
    if (originalSetting) await db.insert(cryptoNetworkSettings).values(originalSetting).onConflictDoUpdate({ target: cryptoNetworkSettings.asset, set: originalSetting });
    else await db.delete(cryptoNetworkSettings).where(eq(cryptoNetworkSettings.asset, "usdt_trc20"));
  }
});
test.after(async () => { await pool.end(); });
