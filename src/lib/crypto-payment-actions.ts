"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getIntegrationConfig } from "@/lib/integration-config";
import { hit } from "@/lib/ratelimit";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";

import { CRYPTO_ASSETS as ASSETS, type CryptoAsset } from "@/lib/crypto-networks";
import { getCryptoNetworkOptions, isCryptoSettingsReady } from "@/lib/crypto-settings";

const AMOUNTS = new Set([2000, 5000, 10000, 20000]);
type AssetKey = CryptoAsset;
const validAsset = (v: string): v is AssetKey => Object.prototype.hasOwnProperty.call(ASSETS, v);

async function appOrigin() {
  const raw = process.env.APP_URL || "";
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Set APP_URL to the public application URL before enabling automatic crypto payments."); }
  if (url.protocol !== "https:") throw new Error("APP_URL must use HTTPS for crypto payment callbacks.");
  return url.origin;
}

function safeCheckoutUrl(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  try { const u = new URL(value); return u.protocol === "https:" ? u.toString() : ""; } catch { return ""; }
}

export async function createCryptoTopUp(fd: FormData) {
  const user = await getUser();
  if (!user || user.role !== "student") redirect("/login");
  const amountUsd = Number(fd.get("amount"));
  const method = String(fd.get("method") || "");
  const provider = String(fd.get("provider") || "");
  const assetKey = String(fd.get("asset") || "") as AssetKey;
  if (!AMOUNTS.has(amountUsd) || !validAsset(assetKey)) redirect("/dashboard?tab=wallet&err=crypto");
  if (!await isCryptoPaymentsSchemaReady() || !await isCryptoSettingsReady()) redirect("/dashboard?tab=wallet&err=crypto_setup");
  if (!await hit(`crypto-topup:${user.id}`, 5, 3600_000)) redirect("/dashboard?tab=wallet&err=rate");
  const asset = ASSETS[assetKey];
  const cfg = await getIntegrationConfig();
  const networkOption = (await getCryptoNetworkOptions()).find(option => option.asset === assetKey);
  if (!networkOption) redirect("/dashboard?tab=wallet&err=crypto_unavailable");

  if (method === "direct") {
    if (!networkOption.directEnabled) redirect("/dashboard?tab=wallet&err=crypto_unavailable");
    const address = networkOption.address;
    if (!address) redirect("/dashboard?tab=wallet&err=crypto_unavailable");
    let payAmount: string;
    let expiresAt: Date;
    if (assetKey === "usdt_trc20" || assetKey === "usdt_bep20") {
      payAmount = (amountUsd / 100).toFixed(2);
      expiresAt = new Date(Date.now() + 30 * 60_000);
    } else {
      const quoteUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(asset.coingecko)}&vs_currencies=usd`;
      let usdPrice = 0;
      try {
        const quoteResponse = await fetch(quoteUrl, { cache: "no-store", signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
        const quote = await quoteResponse.json().catch(() => ({})) as Record<string, { usd?: number }>;
        usdPrice = quoteResponse.ok ? Number(quote[asset.coingecko]?.usd) : 0;
      } catch { redirect("/dashboard?tab=wallet&err=crypto_quote"); }
      if (!Number.isFinite(usdPrice) || usdPrice <= 0) redirect("/dashboard?tab=wallet&err=crypto_quote");
      const decimals = assetKey === "bnb_bep20" ? 8 : 6;
      payAmount = ((amountUsd / 100) / usdPrice).toFixed(decimals);
      expiresAt = new Date(Date.now() + 10 * 60_000);
    }
    const [order] = await db.insert(cryptoPaymentOrders).values({
      userId: user.id, method: "direct", provider: "direct", asset: assetKey,
      network: asset.network, amountUsd, payAmount, payAddress: address,
      status: "awaiting_payment", providerStatus: asset.coingecko ? "coingecko_quote" : "fixed_usdt_quote", expiresAt,
    }).returning({ id: cryptoPaymentOrders.id });
    revalidatePath("/dashboard");
    redirect(`/dashboard?tab=wallet&crypto=${order.id}`);
  }

  if (method !== "provider" || !["nowpayments", "plisio"].includes(provider)) redirect("/dashboard?tab=wallet&err=crypto");
  if ((provider === "nowpayments" && !networkOption.nowpaymentsEnabled) || (provider === "plisio" && !networkOption.plisioEnabled)) redirect("/dashboard?tab=wallet&err=crypto_unavailable");
  const origin = await appOrigin();
  const [order] = await db.insert(cryptoPaymentOrders).values({
    userId: user.id, method: "provider", provider, asset: assetKey, network: asset.network,
    amountUsd, status: "creating", expiresAt: new Date(Date.now() + 45 * 60_000),
  }).returning({ id: cryptoPaymentOrders.id });

  try {
    if (provider === "nowpayments") {
      if (!cfg.crypto.nowPaymentsApiKey || !cfg.crypto.nowPaymentsIpnSecret) throw new Error("NOWPayments is not configured yet.");
      const response = await fetch("https://api.nowpayments.io/v1/payment", {
        method: "POST", headers: { "x-api-key": cfg.crypto.nowPaymentsApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          price_amount: amountUsd / 100, price_currency: "usd", pay_currency: asset.now,
          ipn_callback_url: `${origin}/api/crypto/nowpayments`, order_id: String(order.id),
          order_description: `Lingorain wallet top-up #${order.id}`, is_fixed_rate: true,
        }), cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => ({})) as { payment_id?: string | number; pay_address?: string; pay_amount?: string | number; pay_currency?: string; invoice_url?: string; payment_url?: string; expiration_estimate_date?: string };
      if (!response.ok || !data.payment_id || (!data.pay_address && !data.invoice_url && !data.payment_url)) throw new Error("NOWPayments could not create the payment request.");
      let payAmount = data.pay_amount == null ? "" : String(data.pay_amount);
      let expiry = data.expiration_estimate_date;
      if (!payAmount) {
        const estimateResponse = await fetch(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(String(data.payment_id))}/update-merchant-estimate`, {
          method: "POST", headers: { "x-api-key": cfg.crypto.nowPaymentsApiKey, "Content-Type": "application/json" },
          body: "{}", cache: "no-store", signal: AbortSignal.timeout(12_000),
        });
        const estimate = await estimateResponse.json().catch(() => ({})) as { pay_amount?: string | number; expiration_estimate_date?: string };
        if (!estimateResponse.ok || estimate.pay_amount == null) throw new Error("NOWPayments did not return the exact crypto amount. Please retry or use another payment method.");
        payAmount = String(estimate.pay_amount);
        expiry = estimate.expiration_estimate_date || expiry;
      }
      await db.update(cryptoPaymentOrders).set({
        providerPaymentId: String(data.payment_id), payAddress: data.pay_address || "",
        payAmount, checkoutUrl: safeCheckoutUrl(data.invoice_url || data.payment_url),
        providerStatus: "waiting", status: "pending",
        expiresAt: expiry && Number.isFinite(Date.parse(expiry)) ? new Date(expiry) : new Date(Date.now() + 45 * 60_000),
      }).where(eq(cryptoPaymentOrders.id, order.id));
    } else {
      if (!cfg.crypto.plisioSecretKey) throw new Error("Plisio is not configured yet.");
      const query = new URLSearchParams({
        source_currency: "USD", source_amount: (amountUsd / 100).toFixed(2),
        order_number: String(order.id), order_name: `Lingorain wallet top-up #${order.id}`,
        currency: asset.plisio, allowed_psys_cids: asset.plisio,
        description: `Lingorain wallet top-up #${order.id}`,
        callback_url: `${origin}/api/crypto/plisio?json=true`,
        success_callback_url: `${origin}/dashboard?tab=wallet&crypto=${order.id}`,
        api_key: cfg.crypto.plisioSecretKey,
      });
      const response = await fetch(`https://api.plisio.net/api/v1/invoices/new?${query.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const result = await response.json().catch(() => ({})) as { status?: string; data?: { txn_id?: string; invoice_url?: string; amount?: string; wallet_hash?: string; currency?: string; qr_code?: string; expire_utc?: number } };
      const data = result.data;
      if (!response.ok || result.status !== "success" || !data?.txn_id || !data.invoice_url) throw new Error("Plisio could not create the payment invoice.");
      await db.update(cryptoPaymentOrders).set({
        providerPaymentId: data.txn_id, checkoutUrl: safeCheckoutUrl(data.invoice_url),
        payAmount: data.amount || "", payAddress: data.wallet_hash || "", qrCode: data.qr_code || "",
        providerStatus: "new", status: "pending",
        expiresAt: data.expire_utc ? new Date(data.expire_utc * 1000) : new Date(Date.now() + 10 * 60 * 60_000),
      }).where(eq(cryptoPaymentOrders.id, order.id));
    }
  } catch {
    await db.update(cryptoPaymentOrders).set({ status: "failed", providerStatus: "invoice_creation_failed" }).where(eq(cryptoPaymentOrders.id, order.id));
    redirect("/dashboard?tab=wallet&err=crypto_provider");
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?tab=wallet&crypto=${order.id}`);
}

export async function submitDirectCryptoProof(fd: FormData) {
  const user = await getUser();
  if (!user || user.role !== "student") redirect("/login");
  const id = Number(fd.get("orderId"));
  const txHash = String(fd.get("txHash") || "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !/^(?:0x)?[a-fA-F0-9]{64}$/.test(txHash)) redirect("/dashboard?tab=wallet&err=crypto_hash");
  if (!await isCryptoPaymentsSchemaReady()) redirect("/dashboard?tab=wallet&err=crypto_setup");
  const [order] = await db.select().from(cryptoPaymentOrders).where(and(
    eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.userId, user.id),
    eq(cryptoPaymentOrders.method, "direct"), eq(cryptoPaymentOrders.status, "awaiting_payment"),
  )).limit(1);
  if (!order) redirect("/dashboard?tab=wallet&err=crypto_expired");
  if (order.expiresAt && order.expiresAt <= new Date()) {
    await db.update(cryptoPaymentOrders).set({ status: "expired", providerStatus: "direct_quote_expired" }).where(and(
      eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.userId, user.id), eq(cryptoPaymentOrders.status, "awaiting_payment"),
    ));
    redirect("/dashboard?tab=wallet&err=crypto_expired");
  }
  try {
    await db.update(cryptoPaymentOrders).set({ txHash, status: "pending_review", submittedAt: new Date() }).where(and(
      eq(cryptoPaymentOrders.id, id), eq(cryptoPaymentOrders.userId, user.id), eq(cryptoPaymentOrders.status, "awaiting_payment"),
    ));
  } catch {
    redirect("/dashboard?tab=wallet&err=crypto_duplicate");
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?tab=wallet&crypto=${id}&submitted=1`);
}
