"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, cryptoPaymentOrders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ledgerOnce } from "@/lib/money";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import { isCryptoSettingsReady } from "@/lib/crypto-settings";
import { decimalAtLeast, isCryptoAsset, validExplorerUrl } from "@/lib/crypto-networks";

const noteOf = (fd: FormData) => String(fd.get("note") || "").trim().slice(0, 300);
const orderIdOf = (fd: FormData) => { const id = Number(fd.get("id")); return Number.isSafeInteger(id) && id > 0 ? id : 0; };

export async function approveCryptoPayment(fd: FormData) {
  const admin = await requireAdmin();
  if (!await isCryptoPaymentsSchemaReady() || !await isCryptoSettingsReady()) redirect("/admin/crypto-payments?result=setup_required");
  const id = orderIdOf(fd);
  if (!id) redirect("/admin/crypto-payments?result=invalid");
  if (fd.get("verified") !== "on") redirect("/admin/crypto-payments?result=verification_required");
  const verifiedAmount = String(fd.get("verifiedAmount") || "").trim();
  const explorerUrl = String(fd.get("explorerUrl") || "").trim();
  const note = noteOf(fd);
  let failure = "";
  await db.transaction(async tx => {
    const [order] = await tx.select().from(cryptoPaymentOrders).where(and(eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.status, "pending_review"))).for("update");
    if (!order || order.method !== "direct" || !order.txHash || !isCryptoAsset(order.asset)) { failure = "already_reviewed"; return; }
    if (!decimalAtLeast(verifiedAmount, order.payAmount)) { failure = "amount_mismatch"; return; }
    if (!validExplorerUrl(order.asset, explorerUrl, order.txHash)) { failure = "explorer_required"; return; }
    const [student] = await tx.select({ id: users.id, role: users.role, suspended: users.suspended }).from(users).where(eq(users.id, order.userId)).limit(1);
    if (!student || student.role !== "student" || student.suspended) { failure = "owner_unavailable"; return; }
    const credited = await ledgerOnce(tx, order.userId, "topup", order.amountUsd, `Direct crypto top-up · ${order.asset} · ${order.network}`, `crypto:direct:${order.id}`);
    if (credited) await tx.update(users).set({ balance: sql`${users.balance} + ${order.amountUsd}` }).where(eq(users.id, order.userId));
    await tx.update(cryptoPaymentOrders).set({ status: "paid", providerStatus: "admin_approved", reviewedBy: admin.id, reviewedAt: new Date(), adminNote: note, verifiedAmount, explorerUrl }).where(eq(cryptoPaymentOrders.id, id));
    await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: order.userId, action: "crypto.direct.approved", amount: order.amountUsd, reference: `crypto:direct:${order.id}`, note: note || "Verified on-chain before approval.", metadata: { orderId: id, asset: order.asset, network: order.network, txHash: order.txHash, verifiedAmount, explorerUrl, receivingAddress: order.payAddress } });
  });
  revalidatePath("/admin/crypto-payments"); revalidatePath("/admin/audit"); revalidatePath("/dashboard");
  redirect(`/admin/crypto-payments?result=${failure || "approved"}`);
}

export async function rejectCryptoPayment(fd: FormData) {
  const admin = await requireAdmin();
  if (!await isCryptoPaymentsSchemaReady()) redirect("/admin/crypto-payments?result=setup_required");
  const id = orderIdOf(fd); const note = noteOf(fd);
  if (!id || !note) redirect("/admin/crypto-payments?result=note_required");
  let rejected: typeof cryptoPaymentOrders.$inferSelect | undefined;
  await db.transaction(async tx => {
    const [order] = await tx.update(cryptoPaymentOrders).set({ status: "rejected", providerStatus: "admin_rejected", reviewedBy: admin.id, reviewedAt: new Date(), adminNote: note })
      .where(and(eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.status, "pending_review"), eq(cryptoPaymentOrders.method, "direct"))).returning();
    rejected = order;
    if (order) await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: order.userId, action: "crypto.direct.rejected", amount: order.amountUsd, reference: `crypto:direct:${order.id}`, note, metadata: { orderId: id, asset: order.asset, txHash: order.txHash } });
  });
  revalidatePath("/admin/crypto-payments"); revalidatePath("/admin/audit"); revalidatePath("/dashboard");
  redirect(`/admin/crypto-payments?result=${rejected ? "rejected" : "already_reviewed"}`);
}
