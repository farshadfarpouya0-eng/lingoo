import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import { syncCryptoProviderOrder } from "@/lib/crypto-provider-sync";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Payment not found." }, { status: 404, headers });
  if (!await isCryptoPaymentsSchemaReady()) return Response.json({ error: "Crypto payments are not initialized." }, { status: 503, headers });
  const [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, id)).limit(1);
  if (!order || (user.role !== "admin" && order.userId !== user.id)) return Response.json({ error: "Payment not found." }, { status: 404, headers });
  if (order.method !== "provider") return Response.json({ error: "Direct transfers are verified by an administrator." }, { status: 409, headers });
  if (!await hit(`crypto-sync:${user.id}:${id}`, 10, 60_000)) return Response.json({ error: "Please wait before checking again." }, { status: 429, headers });
  try {
    const fresh = await syncCryptoProviderOrder(id);
    return Response.json({ status: fresh.status, providerStatus: fresh.providerStatus }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "provider_not_configured") return Response.json({ error: "This payment provider is not configured." }, { status: 503, headers });
    if (code === "provider_payment_not_ready") return Response.json({ error: "The provider payment is still being created." }, { status: 409, headers });
    if (code === "payment_mismatch") return Response.json({ error: "The provider response did not match this payment." }, { status: 502, headers });
    return Response.json({ error: "Could not check the payment status. Please try again shortly." }, { status: 502, headers });
  }
}
