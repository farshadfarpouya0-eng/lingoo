"use client";
import { useState, useTransition } from "react";
import { revealPayoutAccount } from "@/lib/admin-actions";

export default function PayoutAccountReveal({ payoutId }: { payoutId: number }) {
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <div className="flex flex-wrap items-center gap-2">
    {account ? <><code className="max-w-[18rem] break-all rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-950">{account}</code><button type="button" onClick={() => setAccount("")} className="text-xs font-semibold text-slate-500 underline">Hide</button></> : <button type="button" disabled={pending} onClick={() => start(async () => {
      setError("");
      const result = await revealPayoutAccount(payoutId);
      if (result.ok) setAccount(result.account); else setError(result.error === "rate" ? "Reveal limit reached" : result.error === "key_unavailable" ? "Encryption key unavailable" : "Could not reveal account");
    })} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">{pending ? "Loading…" : "Reveal account"}</button>}
    {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
  </div>;
}
