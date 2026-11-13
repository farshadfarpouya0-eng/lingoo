"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import type { CryptoOrderDTO } from "@/lib/crypto-orders";
import { CRYPTO_COPY } from "@/lib/crypto-wallet-copy";
import { cryptoCheckoutStep, cryptoDisplayStatus, isCryptoActive } from "@/lib/crypto-checkout-state";
import { isValidTimeZone } from "@/lib/time";
import CopyTextButton from "./CopyTextButton";
import Icon from "./Icon";

export type WalletNetwork = {
  asset: string; label: string; network: string; coin: string;
  directEnabled: boolean; nowpaymentsEnabled: boolean; plisioEnabled: boolean; address: string;
};
const AMOUNTS = [2000, 5000, 10000, 20000];
const money = (cents: number) => `US$${(cents / 100).toFixed(2)}`;
const brand = (value: string) => value === "plisio" ? "Plisio" : "NOWPayments";
const panel = "rounded-2xl border border-slate-200 bg-white";
const primary = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#143e37] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#20594b] disabled:cursor-not-allowed disabled:opacity-45";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50";

export default function CryptoWallet({ networks, initialOrders, nowConfigured, plisioConfigured, timeZone, serverNowMs, lang = "en" }: {
  networks: WalletNetwork[]; initialOrders: CryptoOrderDTO[]; nowConfigured: boolean; plisioConfigured: boolean; timeZone: string; serverNowMs: number; lang?: Lang;
}) {
  const copy = CRYPTO_COPY[lang];
  const router = useRouter();
  const [clock, setClock] = useState(serverNowMs);
  useEffect(() => {
    const started = performance.now();
    setClock(serverNowMs);
    const timer = window.setInterval(() => setClock(serverNowMs + performance.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, [serverNowMs]);
  const canUse = useCallback((network: WalletNetwork, provider: string) => provider === "nowpayments" ? nowConfigured && network.nowpaymentsEnabled : plisioConfigured && network.plisioEnabled, [nowConfigured, plisioConfigured]);
  const providers = useMemo(() => ["nowpayments", "plisio"].filter(provider => networks.some(network => canUse(network, provider))), [networks, canUse]);
  const anyDirect = networks.some(network => network.directEnabled && network.address);
  const [methodChoice, setMethod] = useState<"direct" | "provider">(anyDirect ? "direct" : "provider");
  const method = methodChoice === "provider" && providers.length ? "provider" : anyDirect ? "direct" : "provider";
  const [providerChoice, setProvider] = useState(providers[0] || "nowpayments");
  const provider = providers.includes(providerChoice) ? providerChoice : providers[0] || "nowpayments";
  const [assetChoice, setAsset] = useState("");
  const options = networks.filter(network => method === "direct" ? network.directEnabled && network.address : canUse(network, provider));
  const selected = options.find(network => network.asset === assetChoice) || options[0];
  const [amount, setAmount] = useState(2000);
  const [orders, setOrders] = useState(initialOrders);
  // Resume proof/review, not an expired unpaid invoice that could encourage duplicate payment.
  const [activeId, setActiveId] = useState<number | null>(() => initialOrders.find(order => ["pending_review", "confirming"].includes(order.status))?.id ?? null);
  const [proofOpen, setProofOpen] = useState(false);
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState<"create" | "proof" | "check" | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewedNetwork, setReviewedNetwork] = useState(false);
  const refreshed = useRef(new Set<number>());
  const active = orders.find(order => order.id === activeId);
  const status = active ? cryptoDisplayStatus(active, clock || Date.parse(active.createdAt)) : "";
  const step = cryptoCheckoutStep(status);
  const waitingOrders = orders.filter(order => isCryptoActive(cryptoDisplayStatus(order, clock || Date.parse(order.createdAt))));
  const available = anyDirect || providers.length > 0;
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const date = (value: string) => new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB", { timeZone: zone, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(value));

  const merge = useCallback((incoming: CryptoOrderDTO[]) => setOrders(previous => {
    const map = new Map(previous.map(order => [order.id, order]));
    incoming.forEach(order => map.set(order.id, order));
    return [...map.values()].sort((a, b) => b.id - a.id).slice(0, 16);
  }), []);
  useEffect(() => { merge(initialOrders); }, [initialOrders, merge]);
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("crypto"));
    if (Number.isSafeInteger(id) && initialOrders.some(order => order.id === id)) setActiveId(id);
    // Only restore a gateway return once; later updates must not interrupt another selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setHash(""); setError(""); setNotice(""); setProofOpen(false); setReviewedNetwork(false); }, [activeId]);
  useEffect(() => {
    if (active?.status === "paid" && !refreshed.current.has(active.id)) {
      refreshed.current.add(active.id);
      // A verified server status refreshes balance/history once, never while filling the payment form.
      router.refresh();
    }
  }, [active?.id, active?.status, router]);

  async function responseData(response: Response) {
    const data = await response.json().catch(() => ({})) as { order?: CryptoOrderDTO; orders?: CryptoOrderDTO[]; code?: string; error?: string; status?: string };
    if (!response.ok) throw new Error(response.status === 401 ? copy.errors.auth : copy.errors[data.code || ""] || copy.errors.network);
    return data;
  }
  async function createPayment() {
    if (inFlight.current || !selected) return;
    inFlight.current = true; setBusy("create"); setError(""); setNotice("");
    try {
      const data = await responseData(await fetch("/api/crypto/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountUsd: amount, method, provider, asset: selected.asset }), cache: "no-store" }));
      if (!data.order) throw new Error(copy.errors.crypto_provider);
      merge([data.order]); setActiveId(data.order.id);
    } catch (e) { setError(e instanceof Error ? e.message : copy.errors.network); }
    finally { setBusy(null); inFlight.current = false; }
  }
  async function submitProof() {
    if (!active || inFlight.current || status !== "awaiting_payment") return;
    if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(hash.trim())) { setError(copy.invalidHash); return; }
    inFlight.current = true; setBusy("proof"); setError("");
    try {
      const data = await responseData(await fetch(`/api/crypto/orders/${active.id}/proof`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ txHash: hash.trim() }), cache: "no-store" }));
      if (!data.order) throw new Error(copy.errors.network);
      merge([data.order]); setProofOpen(false); setHash("");
    } catch (e) { setError(e instanceof Error ? e.message : copy.errors.network); }
    finally { inFlight.current = false; setBusy(null); }
  }
  async function checkStatus() {
    if (!active || inFlight.current) return;
    inFlight.current = true; setBusy("check"); setError(""); setNotice("");
    try {
      if (active.method === "provider" && isCryptoActive(active.status)) await responseData(await fetch(`/api/crypto/orders/${active.id}/sync`, { method: "POST", cache: "no-store" }));
      const data = await responseData(await fetch("/api/crypto/orders", { cache: "no-store" }));
      if (!data.orders) throw new Error(copy.errors.network);
      merge(data.orders); setNotice(copy.updated);
    } catch (e) { setError(e instanceof Error ? e.message : copy.errors.network); }
    finally { inFlight.current = false; setBusy(null); }
  }
  useEffect(() => {
    if (!active || !isCryptoActive(active.status)) return;
    let cancelled = false;
    const controller = new AbortController();
    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible" || inFlight.current) return;
      try {
        if (active.method === "provider") await fetch(`/api/crypto/orders/${active.id}/sync`, { method: "POST", cache: "no-store", signal: controller.signal });
        const response = await fetch("/api/crypto/orders", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { orders?: CryptoOrderDTO[] };
        if (!cancelled && data.orders) merge(data.orders);
      } catch { /* A manual status check shows network errors. Never invent a success. */ }
    };
    const timer = window.setInterval(poll, 20_000);
    document.addEventListener("visibilitychange", poll);
    return () => { cancelled = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [active?.id, active?.status, active?.method, merge]);

  const copyButton = (value: string, label: string) => <CopyTextButton value={value} label={label} copiedLabel={copy.copied} fallbackLabel={copy.copyFallback} />;
  const statusColor = (value: string) => value === "paid" ? "bg-emerald-50 text-emerald-700" : ["pending_review", "confirming"].includes(value) ? "bg-amber-50 text-amber-800" : ["expired", "failed", "rejected", "partially_paid"].includes(value) ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500";
  const seconds = active?.expiresAt ? Math.max(0, Math.floor((Date.parse(active.expiresAt) - (clock || Date.parse(active.createdAt))) / 1000)) : null;
  const remaining = seconds === null ? "" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const terminalProblem = ["expired", "rejected", "failed", "partially_paid", "refunded"].includes(status);
  const canSend = !!active && ["awaiting_payment", "pending"].includes(status);
  const readyDirect = canSend && active?.method === "direct" && !!active.payAddress && !!active.payAmount;
  const title = status === "paid" ? copy.paidTitle : status === "pending_review" ? copy.waitingTitle : status === "expired" ? copy.expiredTitle : terminalProblem ? copy.failedTitle : copy.providerWaiting;
  const description = status === "paid" ? copy.paidHint : status === "pending_review" ? copy.waitingHint : status === "expired" ? copy.expiredHint : status === "partially_paid" ? copy.partialHint : terminalProblem ? copy.failedHint : copy.providerWaitingHint;

  return <div className="mt-6" id="crypto-topup" data-testid="crypto-checkout">
    <ol className="mb-7 grid grid-cols-3 gap-2 border-b border-slate-100 pb-5" aria-label="Payment steps">
      {copy.steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${step > index + 1 || status === "paid" ? "bg-teal-100 text-teal-800" : step === index + 1 ? "bg-[#143e37] text-white" : "bg-slate-100 text-slate-400"}`}>{step > index + 1 || status === "paid" ? <Icon name="check" width={15} height={15} /> : `0${index + 1}`}</span><span className={`text-[10px] font-semibold leading-4 sm:text-xs ${step === index + 1 ? "text-teal-950" : "text-slate-500"}`}>{label}</span></li>)}
    </ol>

    {!active && <>
      {!available ? <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{copy.noMethod}</p> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0 space-y-6"><div><h3 className="text-xl font-bold tracking-tight text-teal-950">{copy.chooseTitle}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{copy.chooseHint}</p></div>
          <fieldset><legend className="mb-3 text-xs font-semibold text-slate-600">{copy.amount}</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{AMOUNTS.map(value => <button key={value} type="button" aria-pressed={amount === value} onClick={() => setAmount(value)} className={`min-h-16 rounded-xl border-2 px-2 py-3 text-lg font-bold tabular-nums transition ${amount === value ? "border-teal-700 bg-teal-50 text-teal-950" : "border-slate-100 text-slate-600 hover:border-teal-200"}`}>${value / 100}</button>)}</div></fieldset>
          {anyDirect && providers.length > 0 && <fieldset><legend className="mb-3 text-xs font-semibold text-slate-600">{copy.method}</legend><div className="grid gap-2 sm:grid-cols-2">{(["direct", "provider"] as const).map(value => <button type="button" key={value} aria-pressed={method === value} onClick={() => { setMethod(value); setAsset(""); }} className={`rounded-xl border p-3 text-left ${method === value ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}><b className="text-xs text-teal-950">{value === "direct" ? copy.direct : copy.gateway}</b><span className="mt-1 block text-[10px] leading-5 text-slate-500">{value === "direct" ? copy.directHint : copy.gatewayHint}</span></button>)}</div></fieldset>}
          {method === "provider" && providers.length > 1 && <label className="block text-xs font-semibold text-slate-600">{copy.provider}<select value={provider} onChange={e => setProvider(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{providers.map(value => <option value={value} key={value}>{brand(value)}</option>)}</select></label>}
          <fieldset><legend className="mb-3 text-xs font-semibold text-slate-600">{copy.network}</legend><div className="grid gap-2 sm:grid-cols-2">{options.map(network => <button type="button" key={network.asset} aria-pressed={selected?.asset === network.asset} onClick={() => setAsset(network.asset)} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left transition ${selected?.asset === network.asset ? "border-teal-600 bg-teal-50/70" : "border-slate-200 hover:border-teal-300"}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-teal-100 bg-white text-xs font-bold text-teal-800">{network.coin === "USDT" ? "₮" : network.coin === "BNB" ? "B" : "T"}</span><span className="min-w-0 flex-1"><b className="block text-xs text-teal-950">{network.coin}</b><span className="mt-1 block text-[10px] leading-4 text-slate-500">{network.network}</span></span>{selected?.asset === network.asset && <Icon name="check" width={15} height={15} className="shrink-0 text-teal-700" />}</button>)}</div><p className="mt-2 text-[10px] leading-5 text-slate-500">{copy.networkHint}</p></fieldset>
        </div>
        <aside className="self-start rounded-2xl border border-[#e5ebdf] bg-[#f5f8f2] p-5"><p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">{copy.review}</p><p className="mt-5 text-3xl font-bold tracking-tight text-teal-950">{money(amount)}</p><p className="mt-1 text-[10px] text-slate-500">{copy.receive}</p><dl className="mt-5 space-y-4 border-t border-[#e2e9dc] pt-5 text-xs"><div><dt className="text-slate-500">{copy.onNetwork}</dt><dd className="mt-1 font-semibold text-teal-950">{selected?.coin} · {selected?.network || "—"}</dd></div><div><dt className="text-slate-500">{copy.confirmation}</dt><dd className="mt-1 font-semibold text-teal-950">{method === "direct" ? copy.manual : copy.automatic}</dd></div></dl><button type="button" onClick={createPayment} disabled={!!busy || !selected} className={`${primary} mt-6`}>{busy === "create" ? copy.creating : copy.continue}{!busy && <Icon name="arrow" width={16} height={16} />}</button><p className="mt-3 text-[10px] leading-5 text-slate-500">{copy.noCharge}</p></aside>
      </div>}
      {waitingOrders.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs leading-6 text-amber-900">{copy.pendingNotice}</p>{waitingOrders.slice(0, 2).map(order => <button key={order.id} type="button" onClick={() => setActiveId(order.id)} className="mr-3 mt-2 text-xs font-bold text-teal-800 underline underline-offset-4">#{order.id} · {money(order.amountUsd)} — {copy.resume}</button>)}</div>}
    </>}

    {active && <div data-testid="active-payment" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{copy.reference} <b className="text-teal-950">#{active.id}</b> · {money(active.amountUsd)}</p><span data-testid="payment-status" className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${statusColor(status)}`}>{copy.status[status] || status}</span></div>
      {canSend && !proofOpen && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0"><h3 className="text-xl font-bold text-teal-950">{copy.sendTitle}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{copy.sendHint}</p>
          {active.payAddress && active.payAmount && <><div className={`${panel} mt-5 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 p-4`}><div><p className="text-[10px] font-semibold text-slate-500">{copy.exact}</p><p data-testid="crypto-exact-amount" className="mt-2 break-all text-2xl font-bold tabular-nums text-teal-950">{active.payAmount} <span className="text-sm">{active.coin}</span></p></div>{copyButton(active.payAmount, copy.copyAmount)}</div><div className={`${panel} mt-3 p-4`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold text-slate-500">{copy.address}</p>{copyButton(active.payAddress, copy.copyAddress)}</div><code data-testid="crypto-receiving-address" dir="ltr" className="mt-3 block select-all break-all text-sm leading-7 text-teal-950">{active.payAddress}</code></div><p className="mt-3 text-[10px] leading-5 text-slate-500">{copy.feeHint}</p></>}
          {active.checkoutUrl && <><a href={active.checkoutUrl} target="_blank" rel="noopener noreferrer" className={`${primary} mt-4`}>{copy.invoice}<span aria-hidden="true">↗</span></a><p className="mt-2 text-xs leading-6 text-slate-500">{copy.providerHint}</p></>}
          {readyDirect && <><label className="mt-5 flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-600"><input type="checkbox" checked={reviewedNetwork} onChange={e => setReviewedNetwork(e.target.checked)} className="mt-1 accent-teal-700" /><span>{active.coin} · <b>{active.network}</b>. {copy.networkHint}</span></label><button type="button" disabled={!reviewedNetwork} onClick={() => { setProofOpen(true); setError(""); }} className={`${primary} mt-4`}>{copy.sent}<Icon name="arrow" width={16} height={16} /></button></>}
        </div>
        <aside className="self-start rounded-2xl border border-amber-200 bg-amber-50/60 p-5"><Icon name="alert" className="text-amber-700" />{active.qrCode.length < 300000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(active.qrCode) && <img src={active.qrCode} alt={`${copy.address} · ${active.network}`} width={160} height={160} className="mx-auto mt-4 h-40 w-40 rounded-xl border border-amber-100 bg-white p-2" />}<p className="mt-3 text-xs font-bold text-amber-950">{active.coin} · {active.network}</p><p className="mt-2 text-[11px] leading-6 text-amber-900">{copy.networkWarn}</p>{active.expiresAt && <div className="mt-4 border-t border-amber-200 pt-4"><p className="text-[10px] text-amber-800">{copy.expires}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-950" suppressHydrationWarning>{clock ? remaining : "—"}</p></div>}</aside>
      </div>}
      {proofOpen && status === "awaiting_payment" && <form onSubmit={event => { event.preventDefault(); void submitProof(); }} className={`${panel} p-5 sm:p-6`}>
        <button type="button" onClick={() => { setProofOpen(false); setError(""); }} className="mb-5 text-xs font-semibold text-teal-700">← {copy.back}</button><h3 className="text-xl font-bold text-teal-950">{copy.proofTitle}</h3><p className="mt-2 max-w-xl text-xs leading-6 text-slate-500">{copy.proofHint}</p><label htmlFor={`hash-${active.id}`} className="mt-5 block text-xs font-semibold text-slate-600">{copy.transaction}</label><input id={`hash-${active.id}`} name="txHash" value={hash} onChange={e => setHash(e.target.value)} autoComplete="off" spellCheck={false} maxLength={66} dir="ltr" placeholder={copy.proofPlaceholder} className="mt-2 w-full rounded-xl border border-slate-200 p-3.5 font-mono text-xs outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-50" /><details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-teal-700">{copy.proofMore}</summary><p className="mt-2 max-w-xl rounded-lg bg-slate-50 p-3 leading-6 text-slate-500">{copy.proofHelp}</p></details><button disabled={!!busy || !hash.trim()} className={`${primary} mt-6 sm:max-w-xs`}>{busy === "proof" ? copy.submitting : copy.submit}</button><p className="mt-3 text-[10px] leading-5 text-slate-500">{copy.submittedNote}</p>
      </form>}
      {!canSend && <div data-testid="payment-confirmation" className={`${panel} p-6 text-center sm:p-9`}>
        <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${status === "paid" ? "bg-emerald-50 text-emerald-700" : terminalProblem ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}><Icon name={status === "paid" ? "check" : terminalProblem ? "alert" : "clock"} width={26} height={26} /></span><h3 className="mt-4 text-xl font-bold text-teal-950">{title}</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-500">{description}</p>{status === "paid" && <p className="mt-4 text-3xl font-bold text-emerald-700">+{money(active.amountUsd)}</p>}{active.txHash && <div className="mx-auto mt-5 max-w-lg rounded-xl bg-slate-50 p-3 text-left"><p className="text-[10px] text-slate-500">{copy.transaction}</p><code className="mt-1 block break-all text-xs leading-5 text-slate-600">{active.txHash}</code></div>}{active.adminNote && <p className="mx-auto mt-4 max-w-lg text-xs leading-6 text-slate-600">{copy.note}: {active.adminNote}</p>}{status === "paid" && <Link href="/teachers" className={`${primary} mx-auto mt-6 max-w-xs`}>{copy.browse}<Icon name="arrow" width={16} height={16} /></Link>}
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div><button type="button" disabled={!!busy} onClick={checkStatus} className={secondary}><Icon name="swap" width={14} height={14} />{busy === "check" ? copy.checking : copy.check}</button><p role="status" className="mt-2 text-[10px] leading-5 text-slate-400">{notice || copy.autoUpdate}</p></div><button type="button" disabled={!!busy} onClick={() => { setActiveId(null); setError(""); }} className="text-xs font-semibold text-teal-700 underline underline-offset-4">{copy.newTopup}</button></div>
    </div>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-6 text-red-700">{error}</p>}
    {orders.length > 0 && <details className="mt-6 border-t border-slate-100 pt-5"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><Icon name="clock" width={15} height={15} />{copy.history}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{orders.length}</span></summary><div className="mt-4 divide-y divide-slate-100">{orders.map(order => { const state = cryptoDisplayStatus(order, clock || Date.parse(order.createdAt)); return <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-xs font-semibold text-teal-950">#{order.id} · {money(order.amountUsd)} <span className="font-normal text-slate-500">· {order.coin}</span></p><p className="mt-1 text-[10px] text-slate-400">{date(order.createdAt)} · {order.network}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${statusColor(state)}`}>{copy.status[state] || state}</span><button type="button" onClick={() => setActiveId(order.id)} className="text-[11px] font-semibold text-teal-700 underline">{copy.resume}</button></div></div>; })}</div></details>}
  </div>;
}
