import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders, users } from "@/db/schema";
import { ledgerOnce } from "@/lib/money";
import { decimalAtLeast } from "@/lib/crypto-networks";

export async function updateProviderPayment(input: {
  id: number; provider: "nowpayments" | "plisio"; providerPaymentId: string;
  status: string; txHash?: string; paidAmount?: string;
}) {
  await db.transaction(async tx => {
    const [order] = await tx.select().from(cryptoPaymentOrders)
      .where(and(eq(cryptoPaymentOrders.id, input.id), eq(cryptoPaymentOrders.provider, input.provider)))
      .for("update");
    if (!order || order.method !== "provider" || order.providerPaymentId !== input.providerPaymentId) return;
    if (order.status === "paid" || order.status === "rejected") return;
    const reportedPaid = input.status === "finished" || input.status === "completed";
    const amountVerified = !input.paidAmount || decimalAtLeast(input.paidAmount, order.payAmount);
    const finished = reportedPaid && amountVerified;
    const mapped = finished ? "paid" : reportedPaid && !amountVerified ? "partially_paid"
      : input.status === "partially_paid" ? "partially_paid"
      : ["confirming", "confirmed", "sending", "pending"].includes(input.status) ? "confirming"
      : ["expired", "failed", "cancelled", "error"].includes(input.status) ? (input.status === "error" ? "failed" : input.status) : "pending";
    if (finished) {
      const [buyer] = await tx.select({ id: users.id, role: users.role, suspended: users.suspended }).from(users).where(eq(users.id, order.userId)).limit(1);
      if (!buyer || buyer.role !== "student" || buyer.suspended) return;
      const credited = await ledgerOnce(tx, order.userId, "topup", order.amountUsd, `Crypto top-up · ${order.asset} via ${input.provider}`, `crypto:${input.provider}:${order.id}`);
      if (credited) await tx.update(users).set({ balance: sql`${users.balance} + ${order.amountUsd}` }).where(eq(users.id, order.userId));
    }
    await tx.update(cryptoPaymentOrders).set({ status: mapped, providerStatus: input.status, txHash: input.txHash || order.txHash }).where(eq(cryptoPaymentOrders.id, order.id));
  });
}
