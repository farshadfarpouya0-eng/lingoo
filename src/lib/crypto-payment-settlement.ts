import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders, users } from "@/db/schema";
import { ledgerOnce } from "@/lib/money";
import { decimalAtLeast } from "@/lib/crypto-networks";

export type ProviderPaymentUpdate = {
  id: number; provider: "nowpayments" | "plisio"; providerPaymentId: string;
  status: string; txHash?: string; paidAmount?: string;
};

const CONFIRMING = new Set(["waiting", "confirming", "confirmed", "sending", "pending", "pending internal"]);
const TERMINAL_FAILURE = new Set(["expired", "failed", "cancelled", "error", "cancelled duplicate"]);

export function isPaidProviderStatus(provider: "nowpayments" | "plisio", status: string) {
  return provider === "nowpayments" ? status === "finished" : status === "completed" || status === "mismatch";
}

export async function updateProviderPayment(input: ProviderPaymentUpdate) {
  await db.transaction(async tx => {
    const [order] = await tx.select().from(cryptoPaymentOrders)
      .where(and(eq(cryptoPaymentOrders.id, input.id), eq(cryptoPaymentOrders.provider, input.provider)))
      .for("update");
    if (!order || order.method !== "provider" || order.providerPaymentId !== input.providerPaymentId) return;
    if (order.status === "paid" || order.status === "rejected") return;

    const status = input.status.trim().toLowerCase();
    const reportedPaid = isPaidProviderStatus(input.provider, status);
    // A completion without a verifiable received amount must never credit the wallet.
    const amountVerified = reportedPaid && !!order.payAmount && !!input.paidAmount && decimalAtLeast(input.paidAmount, order.payAmount);
    const finished = reportedPaid && amountVerified;
    let mapped = finished ? "paid"
      : reportedPaid || status === "partially_paid" ? "partially_paid"
      : CONFIRMING.has(status) ? (status === "waiting" || status === "new" ? "pending" : "confirming")
      : TERMINAL_FAILURE.has(status) ? (status === "error" ? "failed" : status === "cancelled duplicate" ? "cancelled" : status)
      : "pending";
    // Do not let a later progress callback erase evidence that only part of the amount arrived.
    if (!finished && order.status === "partially_paid" && (mapped === "confirming" || mapped === "pending")) mapped = "partially_paid";

    if (finished) {
      const [buyer] = await tx.select({ id: users.id, role: users.role, suspended: users.suspended }).from(users).where(eq(users.id, order.userId)).limit(1);
      // Keep the order unsettled while the owner is unavailable/suspended; a later sync can settle it.
      if (!buyer || buyer.role !== "student" || buyer.suspended) return;
      const credited = await ledgerOnce(tx, order.userId, "topup", order.amountUsd, `Crypto top-up · ${order.asset} via ${input.provider}`, `crypto:${input.provider}:${order.id}`);
      if (credited) await tx.update(users).set({ balance: sql`${users.balance} + ${order.amountUsd}` }).where(eq(users.id, order.userId));
    }
    await tx.update(cryptoPaymentOrders).set({ status: mapped, providerStatus: status, txHash: input.txHash || order.txHash }).where(eq(cryptoPaymentOrders.id, order.id));
  });
}
