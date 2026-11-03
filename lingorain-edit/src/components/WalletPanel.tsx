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
import { createCryptoTopUp, submitDirectCryptoProof } from "@/lib/crypto-payment-actions";
const card="rounded-[24px] border border-slate-200 bg-white p-6", input="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
export default async function WalletPanel({ userId, isTutor, balance, escrow, tutor, t, c, lang, timeZone, ok, err }: { userId:number; isTutor:boolean; balance:number; escrow:number; tutor?:typeof teacherProfiles.$inferSelect; t:T; c:LearningCopy; lang:Lang; timeZone?:string; ok?:string; err?:string }) {
  const [txs,withdrawals,[earned]]=await Promise.all([
    db.select().from(transactions).where(eq(transactions.userId,userId)).orderBy(desc(transactions.createdAt),desc(transactions.id)).limit(50),
    isTutor?db.select({ id: payouts.id, amount: payouts.amount, method: payouts.method, status: payouts.status, providerReference: payouts.providerReference, reviewedAt: payouts.reviewedAt, createdAt: payouts.createdAt }).from(payouts).where(eq(payouts.teacherId,userId)).orderBy(desc(payouts.createdAt)).limit(20):Promise.resolve([]),
    db.select({total:sql<number>`coalesce(sum(${transactions.amount}),0)::int`}).from(transactions).where(sql`${transactions.userId}=${userId} and ${transactions.type}='earning'`),
  ]);
  const integration = await getIntegrationConfig();
  const realPaymentsConfigured = Boolean(integration.payments.secretKey);
  const cryptoOrders = isTutor ? [] : await db.select().from(cryptoPaymentOrders)
    .where(eq(cryptoPaymentOrders.userId, userId)).orderBy(desc(cryptoPaymentOrders.createdAt)).limit(8);
  const gatewayOptions = [
    ...(integration.crypto.nowPaymentsApiKey && integration.crypto.nowPaymentsIpnSecret ? ["nowpayments"] : []),
    ...(integration.crypto.plisioSecretKey ? ["plisio"] : []),
  ];
  const directNetworks = [
    ...(integration.crypto.directUsdtTrc20 ? [{ value: "usdt_trc20", label: "USDT · TRC20", address: integration.crypto.directUsdtTrc20 }] : []),
    ...(integration.crypto.directUsdtBep20 ? [{ value: "usdt_bep20", label: "USDT · BEP20", address: integration.crypto.directUsdtBep20 }] : []),
    ...(integration.crypto.directBnbBep20 ? [{ value: "bnb_bep20", label: "BNB · BNB Smart Chain", address: integration.crypto.directBnbBep20 }] : []),
    ...(integration.crypto.directTrxTron ? [{ value: "trx_tron", label: "TRX · TRON", address: integration.crypto.directTrxTron }] : []),
  ];
  const canTopUp = realPaymentsConfigured || demoPaymentsEnabled();
  const unavailable = { en: "Online payments are not configured yet. Wallet top-ups are unavailable.", zh: "在线支付尚未配置，暂时无法充值钱包。", ja: "オンライン決済は未設定です。ウォレットへのチャージは利用できません。" }[lang];
  const labels:Record<string,string>={package_purchase:c.packageTx,package_booking:c.packageBookingTx,package_restore:c.packageRestoreTx};
  return <div className="space-y-6">{ok==="paid"&&<p className="rounded-2xl bg-teal-50 p-4 text-sm font-medium text-teal-800">{t.paid}</p>}{ok==="payout"&&<p className="rounded-2xl bg-teal-50 p-4 text-sm font-medium text-teal-800">{t.payoutRequested}</p>}{err&&<p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">{t[`err_${err}` as keyof T]||t.err_generic}</p>}
    <div className="grid gap-4 md:grid-cols-3"><section className="rounded-[24px] bg-[#123e39] p-8 text-white md:col-span-2"><div className="flex items-center gap-2 text-xs text-teal-100/70"><Icon name="wallet" width={16} height={16}/>{t.availableBalance}</div><div className="mt-3 text-4xl font-bold tracking-tight">{money(balance)}</div>{isTutor&&<p className="mt-4 text-xs text-teal-100/60">{t.earnings}: {money(earned.total)} · {t.pendingEarnings}: {money(escrow)}</p>}</section><div className={card}><Icon name="shield" className="text-teal-700"/><h2 className="mt-3 text-sm font-bold text-teal-950">{t.securePay}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{isTutor?t.minPayout:c.paymentPolicy}</p></div></div>
    {!isTutor&&<form action={topUp as unknown as (fd: FormData) => Promise<void>} className={card}><h2 className="mb-4 text-lg font-bold text-teal-950">{t.topUp}</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[2000,5000,10000,20000].map(a=><button key={a} name="amount" value={a} disabled={!canTopUp} className="rounded-2xl border border-slate-200 py-5 text-xl font-bold text-teal-950 hover:border-teal-600 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40">{money(a)}</button>)}</div>{!realPaymentsConfigured&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">{canTopUp?t.demoNotice:unavailable}</p>}</form>}
    {!isTutor&&<section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-teal-950">Crypto wallet top-up</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Choose a supported coin and the exact network. Automatic payments are credited after the provider confirms them. Direct wallet transfers are credited only after administrator review.</p></div><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">USDT · BNB · TRX</span></div>
      {gatewayOptions.length>0&&<form action={createCryptoTopUp as unknown as (fd:FormData)=>Promise<void>} className="mt-5 rounded-2xl border border-slate-200 p-4">
        <input type="hidden" name="method" value="provider" />
        <h3 className="text-sm font-bold text-teal-950">Automatic payment gateway</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-500">Amount<select name="amount" required defaultValue="2000" className={input}><option value="2000">$20.00</option><option value="5000">$50.00</option><option value="10000">$100.00</option><option value="20000">$200.00</option></select></label>
          <label className="text-xs font-semibold text-slate-500">Payment provider<select name="provider" required defaultValue={gatewayOptions[0]} className={input}>{gatewayOptions.map(p=><option key={p} value={p}>{p === "nowpayments" ? "NOWPayments" : "Plisio"}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-500">Coin / network<select name="asset" required defaultValue="usdt_trc20" className={input}><option value="usdt_trc20">USDT · TRC20</option><option value="usdt_bep20">USDT · BEP20</option><option value="bnb_bep20">BNB · BEP20</option><option value="trx_tron">TRON · TRX (native)</option></select></label>
        </div>
        <button className="mt-4 rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900">Create secure crypto payment</button>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">The amount shown by the provider is the amount to send. Do not send funds to an old or different invoice address. TRX is the native coin on TRON; TRC20 identifies tokens such as USDT on that network.</p>
      </form>}
      {directNetworks.length>0&&<form action={createCryptoTopUp as unknown as (fd:FormData)=>Promise<void>} className="mt-4 rounded-2xl border border-slate-200 p-4">
        <input type="hidden" name="method" value="direct" />
        <h3 className="text-sm font-bold text-teal-950">Direct wallet transfer · admin approval</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-500">Amount<select name="amount" required defaultValue="2000" className={input}><option value="2000">$20.00</option><option value="5000">$50.00</option><option value="10000">$100.00</option><option value="20000">$200.00</option></select></label>
          <label className="text-xs font-semibold text-slate-500">Network<select name="asset" required defaultValue={directNetworks[0].value} className={input}>{directNetworks.map(n=><option key={n.value} value={n.value}>{n.label}</option>)}</select></label>
        </div>
        <button className="mt-4 rounded-xl border border-teal-800 px-5 py-3 text-sm font-bold text-teal-900 hover:bg-teal-50">Create direct transfer request</button>
        <p className="mt-2 text-[11px] leading-5 text-slate-400">For USDT, the requested amount is USD-equivalent 1:1. BNB/TRX use a live quote that expires after 10 minutes. The wallet balance stays unchanged until an administrator verifies the exact transaction and approves it.</p>
      </form>}
      {!gatewayOptions.length&&!directNetworks.length&&<p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Crypto payments are not configured yet. An administrator must save at least one gateway credential or direct receiving address in Admin → Integrations.</p>}
      {!!cryptoOrders.length&&<div className="mt-5 space-y-3"><h3 className="text-sm font-bold text-teal-950">Recent crypto payment requests</h3>{cryptoOrders.map(order=><div key={order.id} className="rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-sm text-teal-950">Payment #{order.id} · {money(order.amountUsd)}</b><p className="mt-1 text-xs text-slate-500">{order.provider === "nowpayments" ? "NOWPayments" : order.provider === "plisio" ? "Plisio" : "Direct wallet"} · {order.asset.toUpperCase()} · {order.network}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${order.status === "paid" ? "bg-emerald-50 text-emerald-700" : order.status === "rejected" || order.status === "failed" || order.status === "expired" ? "bg-red-50 text-red-700" : order.status === "pending_review" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{order.status.replaceAll("_", " ")}</span></div>
        {order.payAddress&&<div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">Receiving address</p><code className="mt-1 block break-all text-xs text-slate-800">{order.payAddress}</code><p className="mt-2 text-xs text-slate-600">Send exactly <b>{order.payAmount} {order.asset.startsWith("usdt")?"USDT":order.asset.startsWith("bnb")?"BNB":"TRX"}</b> on <b>{order.network}</b>.</p></div>}
        {order.method === "direct" && order.expiresAt && <p className="mt-2 text-[11px] text-amber-700">Payment quote expires: {fmtAtZone(order.expiresAt, lang, timeZone || "UTC")}. Create a new request after expiry.</p>}
        {order.checkoutUrl&&<a href={order.checkoutUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white">Open payment invoice ↗</a>}
        {order.qrCode.startsWith("data:image/")&&<img src={order.qrCode} alt="Crypto payment QR code" className="mt-3 h-36 w-36 rounded-xl border border-slate-200 bg-white p-2"/>}
        {order.method === "direct"&&order.status === "awaiting_payment"&&<form action={submitDirectCryptoProof as unknown as (fd:FormData)=>Promise<void>} className="mt-3 grid gap-2"><input type="hidden" name="orderId" value={order.id}/><label className="text-xs font-semibold text-slate-600">Blockchain transaction hash<input name="txHash" required minLength={64} maxLength={66} pattern="(?:0x)?[A-Fa-f0-9]{64}" autoComplete="off" placeholder="Transaction hash (64 hex characters; 0x prefix accepted)" className={input}/></label><button className="rounded-xl border border-teal-800 px-4 py-2.5 text-xs font-bold text-teal-900">Submit for admin approval</button></form>}
        {order.status === "pending_review"&&<p className="mt-3 text-xs font-semibold text-amber-800">Your transfer is waiting for administrator verification. Wallet credit is not available yet.</p>}
        {order.status === "paid"&&<p className="mt-3 text-xs font-semibold text-emerald-700">Payment confirmed. Your wallet has been credited.</p>}
        {order.adminNote&&<p className="mt-2 text-xs text-slate-500">Admin note: {order.adminNote}</p>}
      </div>)}</div>}
    </section>}
    {isTutor&&<div className="grid gap-5 lg:grid-cols-2"><form action={requestPayout as unknown as (fd: FormData) => Promise<void>} className={card}><h2 className="text-lg font-bold text-teal-950">{t.withdraw}</h2><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-500">{t.withdrawAmount}<input name="amount" type="number" min={MIN_PAYOUT/100} max={balance/100} step="0.01" required defaultValue={balance>=MIN_PAYOUT?Math.floor(balance/100):""} className={input}/></label><label className="block text-xs font-semibold text-slate-500">{t.payoutMethod}<select name="method" defaultValue={tutor?.payoutMethod||"PayPal"} className={input}>{["PayPal","Alipay","PayPay","Wise","Bank"].map(m=><option key={m}>{m}</option>)}</select></label><label className="block text-xs font-semibold text-slate-500">{t.payoutAccount}<input name="account" minLength={4} maxLength={200} autoComplete="off" placeholder="Leave blank to use your saved payout account" className={input}/></label><button disabled={balance<MIN_PAYOUT} className="w-full rounded-xl bg-teal-800 py-3 text-sm font-bold text-white disabled:opacity-40">{t.withdraw}</button><p className="text-[11px] leading-5 text-slate-400">{t.minPayout}</p></div></form><div className={card}><h2 className="mb-3 text-lg font-bold text-teal-950">{t.payoutHistory}</h2>{withdrawals.map(p=><div key={p.id} className="border-b border-slate-100 py-3 text-xs"><div className="flex justify-between gap-2"><b className="text-slate-700">{money(p.amount)} · {p.method}</b><span className="text-teal-700">{t[`payout_${p.status}` as keyof T] || p.status}</span></div><p className="mt-1 text-slate-400">{fmtAtZone(p.createdAt,lang,timeZone || "UTC")}</p>{p.providerReference&&<p className="mt-1 break-all text-slate-500">Transfer reference: {p.providerReference}</p>}</div>)}{!withdrawals.length&&<p className="py-4 text-sm text-slate-400">—</p>}</div></div>}
    <section className={card}><h2 className="mb-4 text-lg font-bold text-teal-950">{t.txHistory}</h2>{txs.map(x=><div key={x.id} className="flex justify-between gap-3 border-b border-slate-50 py-3 text-xs"><div><b className="text-slate-600">{labels[x.type]||t[`tx_${x.type}` as keyof T]||x.type}</b><p className="mt-1 text-[11px] text-slate-400">{x.note} · {fmtAtZone(x.createdAt,lang,timeZone || "UTC")}</p></div><span className={`shrink-0 font-bold ${x.amount>0?"text-teal-700":"text-slate-600"}`}>{x.amount===0?"—":`${x.amount>0?"+":"−"}${money(Math.abs(x.amount))}`}</span></div>)}{!txs.length&&<p className="text-sm text-slate-400">—</p>}</section>
  </div>;
}
