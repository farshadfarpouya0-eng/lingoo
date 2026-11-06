import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders } from "@/db/schema";
import { getIntegrationConfig } from "@/lib/integration-config";
import { updateProviderPayment } from "@/lib/crypto-payment-settlement";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import { CRYPTO_ASSETS, isCryptoAsset } from "@/lib/crypto-networks";

export const dynamic = "force-dynamic";
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortDeep(item)]));
}
function validSignature(payload: Record<string, unknown>, secret: string) {
  const supplied = String(payload.verify_hash ?? "");
  if (!/^[a-f0-9]{40}$/i.test(supplied)) return false;
  const unsigned = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "verify_hash"));
  const expected = createHmac("sha1", secret).update(JSON.stringify(sortDeep(unsigned))).digest();
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(req: Request) {
  if (!await isCryptoPaymentsSchemaReady()) return new Response("crypto payments database migration required", { status: 503 });
  const secret = (await getIntegrationConfig()).crypto.plisioSecretKey;
  if (!secret) return new Response("not configured", { status: 404 });
  let payload: Record<string, unknown>;
  try {
    // The invoice callback is registered with ?json=true, the documented non-PHP signing format.
    if (!(req.headers.get("content-type") || "").includes("application/json")) return new Response("JSON callback required", { status: 415 });
    payload = await req.json() as Record<string, unknown>;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return new Response("bad payload", { status: 400 });
  } catch { return new Response("bad payload", { status: 400 }); }
  if (!validSignature(payload, secret)) return new Response("bad signature", { status: 400 });
  if (payload.ipn_type != null && payload.ipn_type !== "invoice") return new Response("unsupported callback", { status: 400 });
  const id = Number(payload.order_number);
  const txnId = String(payload.txn_id ?? "");
  const status = String(payload.status ?? "").toLowerCase();
  const currency = String(payload.psys_cid ?? payload.currency ?? "").toUpperCase();
  if (!Number.isSafeInteger(id) || id < 1 || !txnId) return new Response("bad payment", { status: 400 });
  const [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, id)).limit(1);
  if (!order || order.provider !== "plisio" || order.providerPaymentId !== txnId || !isCryptoAsset(order.asset) || currency !== CRYPTO_ASSETS[order.asset].plisio) return new Response("payment mismatch", { status: 400 });
  const sourceAmount = Number(payload.source_amount);
  if (String(payload.source_currency ?? "").toUpperCase() !== "USD" || !Number.isFinite(sourceAmount) || Math.abs(sourceAmount * 100 - order.amountUsd) > 1) return new Response("payment amount mismatch", { status: 400 });
  const txUrls = Array.isArray(payload.tx_urls) ? payload.tx_urls : typeof payload.tx_urls === "string" ? [payload.tx_urls] : [];
  const txHash = txUrls.map(value => String(value).match(/(?:0x)?[a-fA-F0-9]{64}/)?.[0]).find(Boolean);
  await updateProviderPayment({ id, provider: "plisio", providerPaymentId: txnId, status, txHash });
  return Response.json({ received: true });
}
