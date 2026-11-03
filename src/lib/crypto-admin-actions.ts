"use server";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ledgerOnce } from "@/lib/money";
import { revalidatePath } from "next/cache";

const safeNote = (value: FormDataEntryValue | null) => String(value ?? "").trim().slice(0, 300);

export async function approveCryptoPayment(fd: FormData) {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) redirect("/admin/crypto-payments?result=invalid");
  await db.transaction(async tx => {
    const [order] = await tx.select().from(cryptoPaymentOrders)
      .where(and(eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.status, "pending_review")))
      .for("update");
    if (!order || order.method !== "direct" || !order.txHash) throw new Error("This payment is no longer awaiting review.");
    const [student] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, order.userId)).limit(1);
    if (!student || student.role !== "student") throw new Error("Payment owner is not an active student account.");
    const credited = await ledgerOnce(tx, order.userId, "topup", order.amountUsd,
      `Direct crypto top-up · ${order.asset} · ${order.network}`, `crypto:direct:${order.id}`);
    if (credited) await tx.update(users).set({ balance: sql`${users.balance} + ${order.amountUsd}` }).where(eq(users.id, order.userId));
    await tx.update(cryptoPaymentOrders).set({
      status: "paid", providerStatus: "admin_approved", reviewedBy: admin.id, reviewedAt: new Date(), adminNote: safeNote(fd.get("note")),
    }).where(eq(cryptoPaymentOrders.id, id));
  });
  revalidatePath("/admin/crypto-payments");
  revalidatePath("/dashboard");
  redirect("/admin/crypto-payments?result=approved");
}

export async function rejectCryptoPayment(fd: FormData) {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  const note = safeNote(fd.get("note"));
  if (!Number.isSafeInteger(id) || id < 1 || !note) redirect("/admin/crypto-payments?result=note_required");
  const updated = await db.update(cryptoPaymentOrders).set({ status: "rejected", providerStatus: "admin_rejected", reviewedBy: admin.id, reviewedAt: new Date(), adminNote: note })
    .where(and(eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.status, "pending_review"), eq(cryptoPaymentOrders.method, "direct")))
    .returning({ id: cryptoPaymentOrders.id });
  if (!updated.length) redirect("/admin/crypto-payments?result=already_reviewed");
  revalidatePath("/admin/crypto-payments");
  revalidatePath("/dashboard");
  redirect("/admin/crypto-payments?result=rejected");
}
