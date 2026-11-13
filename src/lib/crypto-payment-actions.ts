"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createCryptoOrder, submitCryptoProof } from "@/lib/crypto-orders";

// Legacy form-action wrappers kept for compatibility. The wallet UI now uses the
// JSON APIs in /api/crypto/orders, which update in place without page redirects.
export async function createCryptoTopUp(fd: FormData) {
  const user = await getUser();
  if (!user || user.role !== "student") redirect("/login");
  try {
    const order = await createCryptoOrder(user.id, {
      amountUsd: Number(fd.get("amount")),
      method: String(fd.get("method") || ""),
      provider: String(fd.get("provider") || ""),
      asset: String(fd.get("asset") || ""),
    });
    revalidatePath("/dashboard");
    redirect(`/dashboard?tab=wallet&crypto=${order.id}`);
  } catch (error) {
    const code = error instanceof Error ? error.message : "crypto";
    redirect(`/dashboard?tab=wallet&err=${code}`);
  }
}

export async function submitDirectCryptoProof(fd: FormData) {
  const user = await getUser();
  if (!user || user.role !== "student") redirect("/login");
  try {
    const order = await submitCryptoProof(user.id, Number(fd.get("orderId")), String(fd.get("txHash") || ""));
    revalidatePath("/dashboard");
    redirect(`/dashboard?tab=wallet&crypto=${order.id}&submitted=1`);
  } catch (error) {
    const code = error instanceof Error ? error.message : "crypto";
    redirect(`/dashboard?tab=wallet&err=${code}`);
  }
}
