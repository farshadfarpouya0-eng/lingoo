"use client";

import { useState } from "react";
import { createCryptoTopUp } from "@/lib/crypto-payment-actions";

export type TopUpNetwork = { asset: string; label: string; directEnabled: boolean; nowpaymentsEnabled: boolean; plisioEnabled: boolean; address: string };
const input = "mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";

export default function CryptoTopUpForm({ networks, nowConfigured, plisioConfigured }: { networks: TopUpNetwork[]; nowConfigured: boolean; plisioConfigured: boolean }) {
  const providerAvailable = (network: TopUpNetwork, provider: string) => provider === "nowpayments" ? nowConfigured && network.nowpaymentsEnabled : plisioConfigured && network.plisioEnabled;
  const anyProvider = networks.some(network => providerAvailable(network, "nowpayments") || providerAvailable(network, "plisio"));
  const anyDirect = networks.some(network => network.directEnabled && network.address);
  const [method, setMethod] = useState<"provider" | "direct">(anyProvider ? "provider" : "direct");
  const [provider, setProvider] = useState(networks.some(network => providerAvailable(network, "nowpayments")) ? "nowpayments" : "plisio");
  const options = networks.filter(network => method === "direct" ? network.directEnabled && network.address : providerAvailable(network, provider));
  const [asset, setAsset] = useState(options[0]?.asset || "");
  const selected = options.some(network => network.asset === asset) ? asset : options[0]?.asset || "";
  if (!anyProvider && !anyDirect) return <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">No crypto network is enabled. An administrator must configure receiving addresses or gateway credentials in Admin → Crypto Settings.</p>;
  return <form action={createCryptoTopUp} className="mt-5 rounded-2xl border border-slate-200 p-4">
    <input type="hidden" name="method" value={method}/>
    <h3 className="text-sm font-bold text-teal-950">{method === "provider" ? "Automatic payment gateway" : "Direct wallet transfer · admin approval"}</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-semibold text-slate-500">Payment method<select value={method} onChange={event => { const next = event.target.value as "provider" | "direct"; setMethod(next); const nextOptions = networks.filter(network => next === "direct" ? network.directEnabled && network.address : providerAvailable(network, provider)); setAsset(nextOptions[0]?.asset || ""); }} className={input}><option value="provider" disabled={!anyProvider}>Automatic gateway</option><option value="direct" disabled={!anyDirect}>Direct wallet transfer</option></select></label>
      <label className="text-xs font-semibold text-slate-500">Amount<select name="amount" required defaultValue="2000" className={input}>{[2000, 5000, 10000, 20000].map(amount => <option key={amount} value={amount}>${(amount / 100).toFixed(2)}</option>)}</select></label>
      {method === "provider" && <label className="text-xs font-semibold text-slate-500">Provider<select name="provider" value={provider} onChange={event => { const next = event.target.value; setProvider(next); const nextOptions = networks.filter(network => providerAvailable(network, next)); setAsset(nextOptions[0]?.asset || ""); }} className={input}><option value="nowpayments" disabled={!nowConfigured || !networks.some(network => network.nowpaymentsEnabled)}>NOWPayments</option><option value="plisio" disabled={!plisioConfigured || !networks.some(network => network.plisioEnabled)}>Plisio</option></select></label>}
      <label className="text-xs font-semibold text-slate-500">Coin / network<select name="asset" required value={selected} onChange={event => setAsset(event.target.value)} className={input}>{options.map(network => <option key={network.asset} value={network.asset}>{network.label}</option>)}</select></label>
    </div>
    <button disabled={!selected} className="mt-4 rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{method === "provider" ? "Create secure crypto payment" : "Create direct transfer request"}</button>
    <p className="mt-2 text-[11px] leading-5 text-slate-400">{method === "provider" ? "Send the exact amount shown by the provider on the selected network. Wallet credit follows a signed confirmation." : "USDT is quoted 1:1 against USD. BNB/TRX quotes expire after 10 minutes. Your wallet is credited only after administrator verification."}</p>
  </form>;
}
