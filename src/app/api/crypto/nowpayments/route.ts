import { createHmac, timingSafeEqual } from "node:crypto";
import { getIntegrationConfig } from "@/lib/integration-config";
import { updateProviderPayment } from "@/lib/crypto-payment-settlement";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";

export const dynamic = "force-dynamic";

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortDeep(v)]));
}
function validSignature(payload: Record<string, unknown>, signature: string | null, secret: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortDeep(payload))).digest();
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(req: Request) {
  if (!await isCryptoPaymentsSchemaReady()) return new Response("crypto payments database migration required", { status: 503 });
  const config = (await getIntegrationConfig()).crypto;
  if (!config.nowPaymentsApiKey || !config.nowPaymentsIpnSecret) return new Response("not configured", { status: 404 });
  let payload: Record<string, unknown>;
  try { payload = await req.json() as Record<string, unknown>; } catch { return new Response("bad payload", { status: 400 }); }
  if (!validSignature(payload, req.headers.get("x-nowpayments-sig"), config.nowPaymentsIpnSecret)) return new Response("bad signature", { status: 400 });
  const id = Number(payload.order_id);
  const paymentId = String(payload.payment_id ?? "");
  const status = String(payload.payment_status ?? "").toLowerCase();
  if (status === "finished" && (payload.actually_paid == null || payload.actually_paid === "")) return new Response("paid amount missing", { status: 400 });
  const priceAmount = Number(payload.price_amount);
  const payCurrency = String(payload.pay_currency ?? "").toLowerCase();
  const priceCurrency = String(payload.price_currency ?? "").toLowerCase();
  if (!Number.isSafeInteger(id) || id < 1 || !paymentId || priceCurrency !== "usd" || !Number.isFinite(priceAmount)) return new Response("bad payment", { status: 400 });
  const { db } = await import("@/db");
  const { cryptoPaymentOrders } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, id)).limit(1);
  if (!order || order.provider !== "nowpayments" || order.providerPaymentId !== paymentId
    || Math.abs(priceAmount * 100 - order.amountUsd) > 1
    || payCurrency !== ({ usdt_trc20: "usdttrc20", usdt_bep20: "usdtbsc", bnb_bep20: "bnbbsc", trx_tron: "trx" } as Record<string,string>)[order.asset]) {
    return new Response("payment mismatch", { status: 400 });
  }
  await updateProviderPayment({ id, provider: "nowpayments", providerPaymentId: paymentId, status, paidAmount: payload.actually_paid == null ? undefined : String(payload.actually_paid), txHash: typeof payload.payin_hash === "string" ? payload.payin_hash : undefined });
  return Response.json({ received: true });
}
