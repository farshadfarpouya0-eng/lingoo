import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders, payouts, teacherProfiles, transactions } from "@/db/schema";
import { requestPayout, topUp } from "@/lib/actions";
import { MIN_PAYOUT } from "@/lib/money";
import { fmtAtZone } from "@/lib/time";
import { money } from "@/lib/package-pricing";
import type { T, Lang } from "@/lib/i18n";
import type { LearningCopy } from "@/lib/learning-i18n";
import Icon from "./Icon";
import { demoPaymentsEnabled } from "@/lib/runtime-policy";
import { getIntegrationConfig } from "@/lib/integration-config";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import { getCryptoNetworkOptions, isCryptoSettingsReady, type CryptoNetworkOption } from "@/lib/crypto-settings";
import CryptoWallet from "@/components/CryptoWallet";
import { CRYPTO_COPY } from "@/lib/crypto-wallet-copy";
import { toCryptoOrderDTO } from "@/lib/crypto-orders";
const card="rounded-[24px] border border-slate-200 bg-white p-6", input="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
export default async function WalletPanel({ userId, isTutor, balance, escrow, tutor, t, c, lang, timeZone, ok, err }: { userId:number; isTutor:boolean; balance:number; escrow:number; tutor?:typeof teacherProfiles.$inferSelect; t:T; c:LearningCopy; lang:Lang; timeZone?:string; ok?:string; err?:string }) {
  const [txs,withdrawals,[earned]]=await Promise.all([
    db.select().from(transactions).where(eq(transactions.userId,userId)).orderBy(desc(transactions.createdAt),desc(transactions.id)).limit(50),
    isTutor?db.select({ id: payouts.id, amount: payouts.amount, method: payouts.method, status: payouts.status, providerReference: payouts.providerReference, reviewedAt: payouts.reviewedAt, createdAt: payouts.createdAt }).from(payouts).where(eq(payouts.teacherId,userId)).orderBy(desc(payouts.createdAt)).limit(20):Promise.resolve([]),
    db.select({total:sql<number>`coalesce(sum(${transactions.amount}),0)::int`}).from(transactions).where(sql`${transactions.userId}=${userId} and ${transactions.type}='earning'`),
  ]);
  // Optional crypto features must never take down the ordinary wallet. In
  // particular, migration 0017 may not yet exist on an older Neon database.
  const [cryptoSchemaReady, integrationResult, settingsSchemaReady] = await Promise.all([
    isCryptoPaymentsSchemaReady(),
    getIntegrationConfig().then(config => ({ config, failed: false as const })).catch(() => ({ config: null, failed: true as const })),
    isCryptoSettingsReady(),
  ]);
  const integration = integrationResult.config;
  const cryptoConfig = integration?.crypto;
  const realPaymentsConfigured = Boolean(integration?.payments.secretKey);
  let cryptoOrders: (typeof cryptoPaymentOrders.$inferSelect)[] = [];
  let cryptoOrdersLoadFailed = false;
  let networkOptions: CryptoNetworkOption[] = [];
  let settingsLoadFailed = false;
  if (!isTutor && cryptoSchemaReady) {
    try { cryptoOrders = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.userId, userId)).orderBy(desc(cryptoPaymentOrders.createdAt)).limit(8); }
    catch { cryptoOrdersLoadFailed = true; }
  }
  if (!isTutor && cryptoSchemaReady && settingsSchemaReady && integration) {
    try { networkOptions = await getCryptoNetworkOptions(); } catch { settingsLoadFailed = true; }
  }
  const cryptoStorageReady = cryptoSchemaReady && !cryptoOrdersLoadFailed;
  const cryptoConfigReady = Boolean(integration);
  const cryptoSettingsAvailable = settingsSchemaReady && !settingsLoadFailed;
  const canTopUp = realPaymentsConfigured || demoPaymentsEnabled();
  const unavailable = { en: "Online payments are not configured yet. Wallet top-ups are unavailable.", zh: "在线支付尚未配置，暂时无法充值钱包。", ja: "オンライン決済は未設定です。ウォレットへのチャージは利用できません。" }[lang];
  const labels:Record<string,string>={package_purchase:c.packageTx,package_booking:c.packageBookingTx,package_restore:c.packageRestoreTx};
  const cryptoErrors: Record<string, string> = {
    crypto: "Check the selected coin, network and amount, then try again.",
    crypto_setup: "Crypto payments are not initialized yet. Ask an administrator to apply migrations 0017 and 0018.",
    crypto_unavailable: "This crypto network or provider is not enabled by the administrator.",
    crypto_config: "Crypto payments need a valid public APP_URL before a gateway invoice can be created.",
    crypto_quote: "The live BNB/TRX quote is unavailable. Wait a moment and try again.",
    crypto_provider: "The payment provider could not create this invoice. Try again or choose another network.",
    crypto_hash: "Enter the 64-character blockchain transaction hash.",
    crypto_expired: "This payment request has expired. Create a new request before sending funds.",
    crypto_duplicate: "This transaction hash has already been submitted for another payment.",
    crypto_submitted: "This transfer has already been submitted for review.",
    rate: "Too many crypto payment requests. Please wait and try again.",
  };
  return <div className="space-y-6">{ok==="paid"&&<p className="rounded-2xl bg-teal-50 p-4 text-sm font-medium text-teal-800">{t.paid}</p>}{ok==="payout"&&<p className="rounded-2xl bg-teal-50 p-4 text-sm font-medium text-teal-800">{t.payoutRequested}</p>}{err&&<p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">{cryptoErrors[err] || (t[`err_${err}` as keyof T]||t.err_generic)}</p>}
    <div className="grid gap-4 md:grid-cols-3"><section className="rounded-[24px] bg-[#123e39] p-8 text-white md:col-span-2"><div className="flex items-center gap-2 text-xs text-teal-100/70"><Icon name="wallet" width={16} height={16}/>{t.availableBalance}</div><div className="mt-3 text-4xl font-bold tracking-tight">{money(balance)}</div>{isTutor&&<p className="mt-4 text-xs text-teal-100/60">{t.earnings}: {money(earned.total)} · {t.pendingEarnings}: {money(escrow)}</p>}</section><div className={card}><Icon name="shield" className="text-teal-700"/><h2 className="mt-3 text-sm font-bold text-teal-950">{t.securePay}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{isTutor?t.minPayout:c.paymentPolicy}</p></div></div>

    {!isTutor&&<section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-teal-950">{CRYPTO_COPY[lang].title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{CRYPTO_COPY[lang].subtitle}</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">USDT · BNB · TRX</span></div>
      {!cryptoStorageReady&&<div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><b className="block">Crypto payment setup is not complete yet.</b><span>{cryptoOrdersLoadFailed ? "The crypto payment table could not be read. Ask an administrator to check the Neon database and migration 0017." : "The crypto payment table is not available in Neon. If migration 0017 has not already been applied, an administrator must apply drizzle/0017_crypto_payments.sql before crypto top-ups can be used. Your existing wallet balance and transaction history remain available."}</span></div>}
      {cryptoStorageReady&&!cryptoConfigReady&&<div role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><b className="block">Payment settings could not be loaded.</b><span>An administrator should check the integration encryption key and saved provider settings. Your existing wallet balance and history remain available.</span></div>}
      {cryptoStorageReady&&cryptoConfigReady&&!cryptoSettingsAvailable&&<p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Crypto network settings need migration 0018. Existing orders and wallet balance remain available.</p>}
      {cryptoStorageReady&&cryptoConfigReady&&cryptoSettingsAvailable&&<CryptoWallet networks={networkOptions} initialOrders={cryptoOrders.map(toCryptoOrderDTO)} nowConfigured={!!(cryptoConfig?.nowPaymentsApiKey && cryptoConfig?.nowPaymentsIpnSecret)} plisioConfigured={!!cryptoConfig?.plisioSecretKey} timeZone={timeZone || "UTC"} lang={lang} serverNowMs={Date.now()} />}
    </section>}
    {!isTutor&&canTopUp&&<details className="rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-teal-900">{lang === "zh" ? "其他充值方式" : lang === "ja" ? "その他のチャージ方法" : "Other ways to top up"}</summary><form action={topUp as unknown as (fd: FormData) => Promise<void>} className={card}><h2 className="mb-4 text-lg font-bold text-teal-950">{t.topUp}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[2000,5000,10000,20000].map(a=><button key={a} name="amount" value={a} disabled={!canTopUp} className="rounded-2xl border border-slate-200 py-5 text-xl font-bold text-teal-950 hover:border-teal-600 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40">{money(a)}</button>)}</div>{!realPaymentsConfigured&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{canTopUp?t.demoNotice:unavailable}</p>}</form></details>}
    {isTutor&&<div className="grid gap-5 lg:grid-cols-2"><form action={requestPayout as unknown as (fd: FormData) => Promise<void>} className={card}><h2 className="text-lg font-bold text-teal-950">{t.withdraw}</h2><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-500">{t.withdrawAmount}<input name="amount" type="number" min={MIN_PAYOUT/100} max={balance/100} step="0.01" required defaultValue={balance>=MIN_PAYOUT?Math.floor(balance/100):""} className={input}/></label><label className="block text-xs font-semibold text-slate-500">{t.payoutMethod}<select name="method" defaultValue={tutor?.payoutMethod||"PayPal"} className={input}>{["PayPal","Alipay","PayPay","Wise","Bank"].map(m=><option key={m}>{m}</option>)}</select></label><label className="block text-xs font-semibold text-slate-500">{t.payoutAccount}<input name="account" minLength={4} maxLength={200} autoComplete="off" placeholder="Leave blank to use your saved payout account" className={input}/></label><button disabled={balance<MIN_PAYOUT} className="w-full rounded-xl bg-teal-800 py-3 text-sm font-bold text-white disabled:opacity-40">{t.withdraw}</button><p className="text-[11px] leading-5 text-slate-400">{t.minPayout}</p></div></form><div className={card}><h2 className="mb-3 text-lg font-bold text-teal-950">{t.payoutHistory}</h2>{withdrawals.map(p=><div key={p.id} className="border-b border-slate-100 py-3 text-xs"><div className="flex justify-between gap-2"><b className="text-slate-700">{money(p.amount)} · {p.method}</b><span className="text-teal-700">{t[`payout_${p.status}` as keyof T] || p.status}</span></div><p className="mt-1 text-slate-400">{fmtAtZone(p.createdAt,lang,timeZone || "UTC")}</p>{p.providerReference&&<p className="mt-1 break-all text-slate-500">Transfer reference: {p.providerReference}</p>}</div>)}{!withdrawals.length&&<p className="py-4 text-sm text-slate-400">—</p>}</div></div>}
    <section className={card}><h2 className="mb-4 text-lg font-bold text-teal-950">{t.txHistory}</h2>{txs.map(x=><div key={x.id} className="flex justify-between gap-3 border-b border-slate-50 py-3 text-xs"><div><b className="text-slate-600">{labels[x.type]||t[`tx_${x.type}` as keyof T]||x.type}</b><p className="mt-1 text-[11px] text-slate-400">{x.note} · {fmtAtZone(x.createdAt,lang,timeZone || "UTC")}</p></div><span className={`shrink-0 font-bold ${x.amount>0?"text-teal-700":"text-slate-600"}`}>{x.amount===0?"—":`${x.amount>0?"+":"−"}${money(Math.abs(x.amount))}`}</span></div>)}{!txs.length&&<p className="text-sm text-slate-400">—</p>}</section>
  </div>;
}
