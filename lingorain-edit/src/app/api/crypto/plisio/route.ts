import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders } from "@/db/schema";
import { getIntegrationConfig } from "@/lib/integration-config";
import { updateProviderPayment } from "@/lib/crypto-payment-settlement";

export const dynamic = "force-dynamic";

function validSignature(payload: Record<string, unknown>, secret: string) {
  const supplied = String(payload.verify_hash ?? "");
  if (!/^[a-f0-9]{40}$/i.test(supplied)) return false;
  const unsigned = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "verify_hash"));
  const expected = createHmac("sha1", secret).update(JSON.stringify(unsigned)).digest();
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(req: Request) {
  const secret = (await getIntegrationConfig()).crypto.plisioSecretKey;
  if (!secret) return new Response("not configured", { status: 404 });
  let payload: Record<string, unknown>;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) payload = await req.json() as Record<string, unknown>;
    else { const fd = await req.formData(); payload = Object.fromEntries(fd.entries()); }
  } catch { return new Response("bad payload", { status: 400 }); }
  if (!validSignature(payload, secret)) return new Response("bad signature", { status: 400 });
  const id = Number(payload.order_number);
  const txnId = String(payload.txn_id ?? "");
  const status = String(payload.status ?? "").toLowerCase();
  const currency = String(payload.psys_cid ?? payload.currency ?? "").toUpperCase();
  if (!Number.isSafeInteger(id) || id < 1 || !txnId) return new Response("bad payment", { status: 400 });
  const [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, id)).limit(1);
  const expectedCurrency = ({ usdt_trc20: "USDT_TRX", usdt_bep20: "USDT_BSC", bnb_bep20: "BNB", trx_tron: "TRX" } as Record<string,string>)[order?.asset || ""];
  if (!order || order.provider !== "plisio" || order.providerPaymentId !== txnId || !currency || !expectedCurrency || currency !== expectedCurrency) return new Response("payment mismatch", { status: 400 });
  await updateProviderPayment({ id, provider: "plisio", providerPaymentId: txnId, status });
  return Response.json({ received: true });
}
