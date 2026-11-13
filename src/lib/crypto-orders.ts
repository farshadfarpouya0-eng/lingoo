import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getIntegrationConfig } from "@/lib/integration-config";
import { hit } from "@/lib/ratelimit";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import {
  CRYPTO_ASSETS as ASSETS,
  decimalUnits,
  isCryptoAsset,
  normalizeTxHash,
  validCheckoutUrl,
  validReceivingAddress,
  type CryptoAsset,
} from "@/lib/crypto-networks";
import { getCryptoNetworkOptions, isCryptoSettingsReady } from "@/lib/crypto-settings";

export const CRYPTO_AMOUNTS = [2000, 5000, 10000, 20000] as const;
export type CryptoOrderDTO = {
  id: number;
  method: "direct" | "provider";
  provider: "direct" | "nowpayments" | "plisio";
  asset: CryptoAsset;
  network: string;
  coin: "USDT" | "BNB" | "TRX";
  amountUsd: number;
  payAmount: string;
  payAddress: string;
  checkoutUrl: string;
  qrCode: string;
  providerPaymentId: string;
  txHash: string;
  status: string;
  providerStatus: string;
  adminNote: string;
  expiresAt: string | null;
  submittedAt: string | null;
  createdAt: string;
};

type OrderRow = typeof cryptoPaymentOrders.$inferSelect;

export function toCryptoOrderDTO(order: OrderRow): CryptoOrderDTO {
  const coin = order.asset.startsWith("usdt") ? "USDT" : order.asset.startsWith("bnb") ? "BNB" : "TRX";
  return {
    id: order.id,
    method: order.method as CryptoOrderDTO["method"],
    provider: order.provider as CryptoOrderDTO["provider"],
    asset: order.asset as CryptoAsset,
    network: order.network,
    coin: coin as CryptoOrderDTO["coin"],
    amountUsd: order.amountUsd,
    payAmount: order.payAmount,
    payAddress: order.payAddress,
    checkoutUrl: order.checkoutUrl,
    qrCode: order.qrCode,
    providerPaymentId: order.providerPaymentId,
    txHash: order.txHash,
    status: order.status,
    providerStatus: order.providerStatus,
    adminNote: order.adminNote,
    expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
    submittedAt: order.submittedAt ? order.submittedAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
  };
}

const positiveAmount = (value: string) => {
  const units = decimalUnits(value);
  return units !== null && units > BigInt(0);
};

async function appOrigin() {
  const raw = process.env.APP_URL || "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("crypto_config");
  }
  if (url.protocol !== "https:") throw new Error("crypto_config");
  return url.origin;
}

export async function listMyCryptoOrders(userId: number, limit = 8): Promise<CryptoOrderDTO[]> {
  const rows = await db
    .select()
    .from(cryptoPaymentOrders)
    .where(eq(cryptoPaymentOrders.userId, userId))
    .orderBy(desc(cryptoPaymentOrders.createdAt), desc(cryptoPaymentOrders.id))
    .limit(limit);
  return rows.map(toCryptoOrderDTO);
}

export async function createCryptoOrder(
  userId: number,
  input: { amountUsd: number; method: string; provider?: string; asset: string },
): Promise<CryptoOrderDTO> {
  const amountUsd = Number(input.amountUsd);
  const method = String(input.method || "");
  const provider = String(input.provider || "");
  const assetKey = String(input.asset || "");
  if (!CRYPTO_AMOUNTS.includes(amountUsd as (typeof CRYPTO_AMOUNTS)[number]) || !isCryptoAsset(assetKey)) {
    throw new Error("crypto");
  }
  if (!(await isCryptoPaymentsSchemaReady()) || !(await isCryptoSettingsReady())) throw new Error("crypto_setup");
  if (!(await hit(`crypto-topup:${userId}`, 5, 3600_000))) throw new Error("rate");
  const asset = ASSETS[assetKey];
  const cfg = await getIntegrationConfig();
  const networkOption = (await getCryptoNetworkOptions()).find((o) => o.asset === assetKey);
  if (!networkOption) throw new Error("crypto_unavailable");

  if (method === "direct") {
    if (!networkOption.directEnabled) throw new Error("crypto_unavailable");
    const address = networkOption.address;
    if (!address || !validReceivingAddress(assetKey, address)) throw new Error("crypto_unavailable");
    let payAmount: string;
    let expiresAt: Date;
    if (assetKey === "usdt_trc20" || assetKey === "usdt_bep20") {
      payAmount = (amountUsd / 100).toFixed(2);
      expiresAt = new Date(Date.now() + 30 * 60_000);
    } else {
      const quoteUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(asset.coingecko)}&vs_currencies=usd`;
      let usdPrice = 0;
      try {
        const quoteResponse = await fetch(quoteUrl, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
          headers: { accept: "application/json" },
        });
        const quote = (await quoteResponse.json().catch(() => ({}))) as Record<string, { usd?: number }>;
        usdPrice = quoteResponse.ok ? Number(quote[asset.coingecko]?.usd) : 0;
      } catch {
        throw new Error("crypto_quote");
      }
      if (!Number.isFinite(usdPrice) || usdPrice <= 0) throw new Error("crypto_quote");
      const decimals = assetKey === "bnb_bep20" ? 8 : 6;
      payAmount = ((amountUsd / 100) / usdPrice).toFixed(decimals);
      expiresAt = new Date(Date.now() + 10 * 60_000);
    }
    const [order] = await db
      .insert(cryptoPaymentOrders)
      .values({
        userId,
        method: "direct",
        provider: "direct",
        asset: assetKey,
        network: asset.network,
        amountUsd,
        payAmount,
        payAddress: address,
        status: "awaiting_payment",
        providerStatus: asset.coingecko ? "coingecko_quote" : "fixed_usdt_quote",
        expiresAt,
      })
      .returning();
    return toCryptoOrderDTO(order);
  }

  if (method !== "provider" || !["nowpayments", "plisio"].includes(provider)) throw new Error("crypto");
  if (provider === "nowpayments" && !networkOption.nowpaymentsEnabled) throw new Error("crypto_unavailable");
  if (provider === "plisio" && !networkOption.plisioEnabled) throw new Error("crypto_unavailable");
  if (provider === "nowpayments" && (!cfg.crypto.nowPaymentsApiKey || !cfg.crypto.nowPaymentsIpnSecret)) {
    throw new Error("crypto_unavailable");
  }
  if (provider === "plisio" && !cfg.crypto.plisioSecretKey) throw new Error("crypto_unavailable");
  let origin = "";
  try {
    origin = await appOrigin();
  } catch {
    throw new Error("crypto_config");
  }
  const [order] = await db
    .insert(cryptoPaymentOrders)
    .values({
      userId,
      method: "provider",
      provider,
      asset: assetKey,
      network: asset.network,
      amountUsd,
      status: "creating",
      expiresAt: new Date(Date.now() + 45 * 60_000),
    })
    .returning();

  try {
    if (provider === "nowpayments") {
      const response = await fetch("https://api.nowpayments.io/v1/payment", {
        method: "POST",
        headers: { "x-api-key": cfg.crypto.nowPaymentsApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          price_amount: amountUsd / 100,
          price_currency: "usd",
          pay_currency: asset.now,
          ipn_callback_url: `${origin}/api/crypto/nowpayments`,
          order_id: String(order.id),
          order_description: `Lingorain wallet top-up #${order.id}`,
          is_fixed_rate: true,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await response.json().catch(() => ({}))) as {
        payment_id?: string | number;
        pay_address?: string;
        pay_amount?: string | number;
        pay_currency?: string;
        invoice_url?: string;
        payment_url?: string;
        expiration_estimate_date?: string;
      };
      if (!response.ok || !data.payment_id || (!data.pay_address && !data.invoice_url && !data.payment_url)) {
        throw new Error("NOWPayments could not create the payment request.");
      }
      if (data.pay_currency && data.pay_currency.toLowerCase() !== asset.now) {
        throw new Error("NOWPayments returned a different currency than selected.");
      }
      let payAmount = data.pay_amount == null ? "" : String(data.pay_amount);
      let expiry = data.expiration_estimate_date;
      if (!payAmount) {
        const estimateResponse = await fetch(
          `https://api.nowpayments.io/v1/payment/${encodeURIComponent(String(data.payment_id))}/update-merchant-estimate`,
          {
            method: "POST",
            headers: { "x-api-key": cfg.crypto.nowPaymentsApiKey, "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
            signal: AbortSignal.timeout(12_000),
          },
        );
        const estimate = (await estimateResponse.json().catch(() => ({}))) as {
          pay_amount?: string | number;
          expiration_estimate_date?: string;
          pay_currency?: string;
        };
        if (!estimateResponse.ok || estimate.pay_amount == null) {
          throw new Error("NOWPayments did not return the exact crypto amount. Please retry or use another payment method.");
        }
        if (estimate.pay_currency && estimate.pay_currency.toLowerCase() !== asset.now) {
          throw new Error("NOWPayments returned a different currency than selected.");
        }
        payAmount = String(estimate.pay_amount);
        expiry = estimate.expiration_estimate_date || expiry;
      }
      if (!positiveAmount(payAmount)) throw new Error("NOWPayments did not return a valid exact crypto amount.");
      const [updated] = await db
        .update(cryptoPaymentOrders)
        .set({
          providerPaymentId: String(data.payment_id),
          payAddress: data.pay_address || "",
          payAmount,
          checkoutUrl: validCheckoutUrl("nowpayments", data.invoice_url || data.payment_url),
          providerStatus: "waiting",
          status: "pending",
          expiresAt: expiry && Number.isFinite(Date.parse(expiry)) ? new Date(expiry) : new Date(Date.now() + 45 * 60_000),
        })
        .where(eq(cryptoPaymentOrders.id, order.id))
        .returning();
      return toCryptoOrderDTO(updated || { ...order, status: "pending" });
    }

    const query = new URLSearchParams({
      source_currency: "USD",
      source_amount: (amountUsd / 100).toFixed(2),
      order_number: String(order.id),
      order_name: `Lingorain wallet top-up #${order.id}`,
      currency: asset.plisio,
      allowed_psys_cids: asset.plisio,
      description: `Lingorain wallet top-up #${order.id}`,
      callback_url: `${origin}/api/crypto/plisio?json=true`,
      success_invoice_url: `${origin}/dashboard?tab=wallet&crypto=${order.id}`,
      fail_invoice_url: `${origin}/dashboard?tab=wallet&crypto=${order.id}`,
      api_key: cfg.crypto.plisioSecretKey,
    });
    const response = await fetch(`https://api.plisio.net/api/v1/invoices/new?${query.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const result = (await response.json().catch(() => ({}))) as {
      status?: string;
      data?: {
        txn_id?: string;
        invoice_url?: string;
        amount?: string;
        wallet_hash?: string;
        currency?: string;
        psys_cid?: string;
        qr_code?: string;
        expire_utc?: number | string;
      };
    };
    const data = result.data;
    if (!response.ok || result.status !== "success" || !data?.txn_id || !data.invoice_url) {
      throw new Error("Plisio could not create the payment invoice.");
    }
    const returnedCurrency = String(data.psys_cid || data.currency || "").toUpperCase();
    if (returnedCurrency && returnedCurrency !== asset.plisio) {
      throw new Error("Plisio returned a different currency than selected.");
    }
    const [updated] = await db
      .update(cryptoPaymentOrders)
      .set({
        providerPaymentId: data.txn_id,
        checkoutUrl: validCheckoutUrl("plisio", data.invoice_url),
        payAmount: data.amount || "",
        payAddress: data.wallet_hash || "",
        qrCode: data.qr_code || "",
        providerStatus: "new",
        status: "pending",
        expiresAt: data.expire_utc ? new Date(Number(data.expire_utc) * 1000) : new Date(Date.now() + 10 * 60 * 60_000),
      })
      .where(eq(cryptoPaymentOrders.id, order.id))
      .returning();
    return toCryptoOrderDTO(updated || { ...order, status: "pending" });
  } catch {
    const [failed] = await db
      .update(cryptoPaymentOrders)
      .set({ status: "failed", providerStatus: "invoice_creation_failed" })
      .where(eq(cryptoPaymentOrders.id, order.id))
      .returning();
    if (failed) return toCryptoOrderDTO(failed);
    throw new Error("crypto_provider");
  }
}

export async function submitCryptoProof(userId: number, orderId: number, rawHash: string): Promise<CryptoOrderDTO> {
  const id = Number(orderId);
  const hash = String(rawHash || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !/^(?:0x)?[a-fA-F0-9]{64}$/.test(hash)) throw new Error("crypto_hash");
  if (!(await isCryptoPaymentsSchemaReady())) throw new Error("crypto_setup");
  const user = await getUser();
  if (!user || user.id !== userId || user.role !== "student") throw new Error("crypto");
  if (!(await hit(`crypto-proof:${userId}`, 10, 3600_000))) throw new Error("rate");
  const [order] = await db
    .select()
    .from(cryptoPaymentOrders)
    .where(and(eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.userId, userId), eq(cryptoPaymentOrders.method, "direct")))
    .limit(1);
  if (!order || order.status !== "awaiting_payment") {
    throw new Error(order?.status === "pending_review" ? "crypto_submitted" : "crypto_expired");
  }
  if (!isCryptoAsset(order.asset)) throw new Error("crypto");
  const txHash = normalizeTxHash(order.asset, hash);
  if (!txHash) throw new Error("crypto_hash");
  const [duplicate] = await db
    .select({ id: cryptoPaymentOrders.id })
    .from(cryptoPaymentOrders)
    .where(and(eq(cryptoPaymentOrders.network, order.network), eq(cryptoPaymentOrders.txHash, txHash)))
    .limit(1);
  if (duplicate && duplicate.id !== id) throw new Error("crypto_duplicate");
  if (order.expiresAt && order.expiresAt <= new Date()) {
    await db
      .update(cryptoPaymentOrders)
      .set({ status: "expired", providerStatus: "direct_quote_expired" })
      .where(
        and(
          eq(cryptoPaymentOrders.id, id),
          eq(cryptoPaymentOrders.userId, userId),
          eq(cryptoPaymentOrders.status, "awaiting_payment"),
        ),
      );
    throw new Error("crypto_expired");
  }
  try {
    const updated = await db
      .update(cryptoPaymentOrders)
      .set({ txHash, status: "pending_review", submittedAt: new Date() })
      .where(
        and(
          eq(cryptoPaymentOrders.id, id),
          eq(cryptoPaymentOrders.userId, userId),
          eq(cryptoPaymentOrders.status, "awaiting_payment"),
        ),
      )
      .returning();
    if (!updated.length) throw new Error("crypto_submitted");
    return toCryptoOrderDTO(updated[0]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("crypto_")) throw error;
    throw new Error("crypto_duplicate");
  }
}

export async function requireMyCryptoOrder(userId: number, orderId: number) {
  const [order] = await db
    .select()
    .from(cryptoPaymentOrders)
    .where(and(eq(cryptoPaymentOrders.id, orderId), eq(cryptoPaymentOrders.userId, userId)))
    .limit(1);
  if (!order) throw new Error("not_found");
  return order;
}
