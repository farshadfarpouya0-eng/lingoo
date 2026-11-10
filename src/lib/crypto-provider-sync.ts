import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders } from "@/db/schema";
import { getIntegrationConfig } from "./integration-config";
import { CRYPTO_ASSETS, isCryptoAsset } from "./crypto-networks";
import { updateProviderPayment, type ProviderPaymentUpdate } from "./crypto-payment-settlement";

type Order = typeof cryptoPaymentOrders.$inferSelect;
type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
const text = (value: unknown) => value == null ? "" : String(value);
const nested = (data: UnknownRecord, key: string) => record(data[key]) || {};
function hashFrom(value: unknown): string {
  if (Array.isArray(value)) return value.map(hashFrom).find(Boolean) || "";
  const raw = text(value);
  return raw.match(/(?:0x)?[a-fA-F0-9]{64}/)?.[0] || "";
}
function assertOrder(order: Order) {
  if (order.method !== "provider" || (order.provider !== "nowpayments" && order.provider !== "plisio")) throw new Error("not_provider");
  if (!order.providerPaymentId) throw new Error("provider_payment_not_ready");
  if (!isCryptoAsset(order.asset)) throw new Error("payment_mismatch");
}

export function parseNowPaymentsStatus(value: unknown, order: Order): ProviderPaymentUpdate {
  assertOrder(order);
  const data = record(value);
  if (!data) throw new Error("provider_response_invalid");
  const paymentId = text(data.payment_id);
  const providerOrderId = text(data.order_id);
  const priceAmount = Number(data.price_amount);
  const payCurrency = text(data.pay_currency).toLowerCase();
  if (paymentId !== order.providerPaymentId || (providerOrderId && providerOrderId !== String(order.id))
    || text(data.price_currency).toLowerCase() !== "usd" || !Number.isFinite(priceAmount)
    || Math.abs(priceAmount * 100 - order.amountUsd) > 1 || payCurrency !== CRYPTO_ASSETS[order.asset as keyof typeof CRYPTO_ASSETS].now) {
    throw new Error("payment_mismatch");
  }
  if (order.payAddress && text(data.pay_address) && text(data.pay_address) !== order.payAddress) throw new Error("payment_mismatch");
  return {
    id: order.id, provider: "nowpayments", providerPaymentId: paymentId,
    status: text(data.payment_status).toLowerCase(),
    paidAmount: data.actually_paid == null ? undefined : text(data.actually_paid),
    txHash: hashFrom(data.payin_hash) || undefined,
  };
}

export function parsePlisioOperation(value: unknown, order: Order): ProviderPaymentUpdate {
  assertOrder(order);
  const root = record(value);
  if (!root) throw new Error("provider_response_invalid");
  if (text(root.status) && text(root.status) !== "success") throw new Error("provider_request_failed");
  const data = record(root.data) || root;
  const params = nested(data, "params");
  // Plisio's internal operation id can differ from the invoice txn_id. The endpoint is
  // queried by txn_id, so a conflicting explicit txn_id is a mismatch; a different
  // internal id alone is not. Some operation responses also omit fiat/currency fields.
  const explicitTxnId = text(data.txn_id);
  if (explicitTxnId && explicitTxnId !== order.providerPaymentId) throw new Error("payment_mismatch");
  const orderNumber = text(data.order_number || params.order_number);
  if (orderNumber && orderNumber !== String(order.id)) throw new Error("payment_mismatch");
  const currency = text(data.psys_cid || data.currency || params.currency).toUpperCase();
  if (currency && currency !== CRYPTO_ASSETS[order.asset as keyof typeof CRYPTO_ASSETS].plisio) throw new Error("payment_mismatch");
  const sourceCurrency = text(data.source_currency || params.source_currency).toUpperCase();
  if (sourceCurrency && sourceCurrency !== "USD") throw new Error("payment_mismatch");
  const rawSourceAmount = data.source_amount || params.source_amount;
  if (rawSourceAmount != null && rawSourceAmount !== "") {
    const sourceAmount = Number(rawSourceAmount);
    if (!Number.isFinite(sourceAmount) || Math.abs(sourceAmount * 100 - order.amountUsd) > 1) throw new Error("payment_mismatch");
  }
  const status = text(data.status).toLowerCase();
  const paidAmount = text(data.actual_sum || data.amount || data.invoice_total_sum);
  return {
    id: order.id, provider: "plisio", providerPaymentId: order.providerPaymentId, status,
    paidAmount: paidAmount || undefined,
    txHash: hashFrom(data.tx_id) || hashFrom(data.tx_url) || hashFrom(data.tx_urls) || undefined,
  };
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  return data as unknown;
}

export async function fetchProviderPaymentUpdate(order: Order): Promise<ProviderPaymentUpdate> {
  assertOrder(order);
  const cfg = await getIntegrationConfig();
  if (order.provider === "nowpayments") {
    if (!cfg.crypto.nowPaymentsApiKey) throw new Error("provider_not_configured");
    const data = await fetchJson(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(order.providerPaymentId)}`, { headers: { "x-api-key": cfg.crypto.nowPaymentsApiKey } });
    return parseNowPaymentsStatus(data, order);
  }
  if (!cfg.crypto.plisioSecretKey) throw new Error("provider_not_configured");
  const query = new URLSearchParams({ api_key: cfg.crypto.plisioSecretKey });
  const data = await fetchJson(`https://api.plisio.net/api/v1/operations/${encodeURIComponent(order.providerPaymentId)}?${query.toString()}`, {});
  return parsePlisioOperation(data, order);
}

/** Trusted server-side callers must authorize the order owner/admin before invoking this. */
export async function syncCryptoProviderOrder(orderId: number): Promise<Order> {
  const [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, orderId)).limit(1);
  if (!order) throw new Error("order_not_found");
  if (order.method === "provider" && !order.providerPaymentId && order.status === "creating" && Date.now() - order.createdAt.getTime() > 15 * 60_000) {
    const [abandoned] = await db.update(cryptoPaymentOrders).set({ status: "failed", providerStatus: "invoice_creation_abandoned" }).where(eq(cryptoPaymentOrders.id, orderId)).returning();
    return abandoned || order;
  }
  assertOrder(order);
  if (order.status === "paid") return order;
  const update = await fetchProviderPaymentUpdate(order);
  await updateProviderPayment(update);
  const [fresh] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, orderId)).limit(1);
  return fresh || order;
}
