"use client";
import { useEffect, useState } from "react";
import { createReferralLink, claimReferralReward } from "@/lib/feature-actions";

export default function ReferralPanel({ code, qualified, rewardChoices, credits25, credits50 }: {
  code: string | null; qualified: number; rewardChoices: number; credits25: number; credits50: number;
}) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [selected, setSelected] = useState("25");
  const [error, setError] = useState("");
  const path = code ? `/register?ref=${encodeURIComponent(code)}` : "";
  useEffect(() => { setOrigin(window.location.origin); }, []);
  async function copy() {
    if (!path) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError("Copy was blocked by your browser. Select and copy the link manually."); }
  }
  return <section className="rounded-[24px] border border-amber-200 bg-[#fffdf7] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Invite friends</p><h2 className="mt-1 text-lg font-bold text-teal-950">Earn free lessons by referring friends</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A friend counts after signing up through your link and completing their first paid, non-trial lesson. Every 3 qualified friends unlock one reward choice.</p></div><div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm"><strong className="block text-2xl text-teal-800">{qualified}/3</strong><span className="text-[11px] text-slate-500">toward next reward</span></div></div>
    {code ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"><code className="min-w-0 flex-1 break-all text-sm text-teal-900">{origin ? `${origin}${path}` : path}</code><button type="button" onClick={copy} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white">{copied ? "Copied!" : "Copy link"}</button></div> : <form action={async (fd) => { await createReferralLink(fd); }} className="mt-4"><button className="rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white">Create my referral link</button></form>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-bold text-teal-950">10 × 25-minute lessons</p><p className="mt-1 text-xs text-slate-500">Current credits: {credits25}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-bold text-teal-950">5 × 50-minute lessons</p><p className="mt-1 text-xs text-slate-500">Current credits: {credits50}</p></div></div>
    {rewardChoices > 0 && <form action={async (fd) => { await claimReferralReward(fd); }} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-teal-50 p-3"><input type="hidden" name="duration" value={selected}/><input type="hidden" name="count" value={selected === "25" ? "10" : "5"}/><label htmlFor="referral-reward" className="text-sm font-semibold text-teal-950">Unlocked reward ({rewardChoices} choice{rewardChoices === 1 ? "" : "s"} available)</label><select id="referral-reward" value={selected} onChange={e => setSelected(e.target.value)} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm"><option value="25">10 free lessons · 25 min</option><option value="50">5 free lessons · 50 min</option></select><button className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-bold text-white">Claim reward</button></form>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
  </section>;
}