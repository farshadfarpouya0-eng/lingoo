import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getIntegrationConfig } from "@/lib/integration-config";
import { getCryptoNetworkOptions, isCryptoSettingsReady } from "@/lib/crypto-settings";
import { saveCryptoSettings } from "@/lib/crypto-settings-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crypto Settings · Lingorain Admin" };

export default async function CryptoSettingsPage({ searchParams }: { searchParams: Promise<{ result?: string; asset?: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const sp = await searchParams;
  if (!await isCryptoSettingsReady()) return <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-2xl font-black text-amber-950">Crypto Settings</h1><p className="mt-3 text-sm leading-6 text-amber-900">Apply migration <code>0018_crypto_network_settings.sql</code> using the controlled migration procedure, then reload. Existing wallet balances are unaffected.</p></section>;
  const [networks, cfg] = await Promise.all([getCryptoNetworkOptions(), getIntegrationConfig()]);
  const nowReady = !!(cfg.crypto.nowPaymentsApiKey && cfg.crypto.nowPaymentsIpnSecret);
  const plisioReady = !!cfg.crypto.plisioSecretKey;
  const messages: Record<string, string> = { saved: "Crypto network settings saved and audited.", setup: "Database migration 0018 is required.", address: "Enter a valid public receiving address for the selected network.", address_required: "A direct transfer network needs a receiving address before it can be enabled." };
  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Wallet funding</p><h1 className="mt-1 text-3xl font-black text-teal-950">Crypto Settings</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Control each network independently. Direct transfers use your public receiving addresses and require admin verification. Gateway payments are credited only after a signed provider confirmation.</p></div><Link href="/admin/crypto-payments" className="rounded-xl border border-teal-800 px-4 py-2.5 text-sm font-bold text-teal-800">Review payments →</Link></div>
    {sp.result && <p role="status" className={`mb-4 rounded-xl border p-3 text-sm ${sp.result === "saved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{messages[sp.result] || "Check the settings and try again."}{sp.asset ? ` Network: ${sp.asset.replaceAll("_", " ")}.` : ""}</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-bold text-teal-950">NOWPayments</p><p className="mt-1 text-xs text-slate-500">{nowReady ? "API key and IPN secret configured." : "API key and IPN secret required."}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-bold text-teal-950">Plisio</p><p className="mt-1 text-xs text-slate-500">{plisioReady ? "Shop secret configured." : "Shop secret required."}</p></div><Link href="/admin/integrations#provider-cryptoPayments" className="text-sm font-semibold text-teal-700 underline sm:col-span-2">Manage gateway credentials in Integrations →</Link></div>
    <form action={saveCryptoSettings} className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">{networks.map(network => <section key={network.asset} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-teal-950">{network.label}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{network.managed ? "Explicit settings" : "Legacy defaults"}</span></div><p className="mt-1 text-xs text-slate-500">{network.network}</p>
        <div className="mt-4 space-y-4"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name={`direct_${network.asset}`} defaultChecked={network.directEnabled}/>Enable direct wallet transfers</label>
          <label className="block text-xs font-semibold text-slate-600">Public receiving address<input name={`address_${network.asset}`} defaultValue={network.address} autoComplete="off" spellCheck={false} placeholder={network.asset.includes("trc20") || network.asset === "trx_tron" ? "TRON public address (T…)" : "BNB Smart Chain public address (0x…)"} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs"/><span className="mt-1 block text-[10px] font-normal text-slate-400">Never enter a private key, seed phrase or wallet password.</span></label>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3"><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" name={`nowpayments_${network.asset}`} defaultChecked={network.nowpaymentsEnabled}/>Allow NOWPayments for this network {!nowReady && <span className="text-amber-700">(credentials missing)</span>}</label><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" name={`plisio_${network.asset}`} defaultChecked={network.plisioEnabled}/>Allow Plisio for this network {!plisioReady && <span className="text-amber-700">(credentials missing)</span>}</label></div>
        </div>
      </section>)}</div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">Disabling a network stops new requests only. Existing invoices can still settle through signed callbacks. Direct transfers remain pending until an administrator verifies the transaction, network, address and amount. Saving writes an audit record.</div>
      <button className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white">Save all network settings</button>
    </form>
  </>;
}
