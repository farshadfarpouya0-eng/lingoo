"use client";

import { useActionState } from "react";
import { savePricingConfig } from "@/lib/admin-actions";
import type { PricingConfig } from "@/lib/pricing-config";

const inp = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const lab = "block text-xs font-semibold text-slate-500";

export default function PricingForm({ initial }: { initial: PricingConfig }) {
  const [state, action, pending] = useActionState(savePricingConfig, { ok: false } as { ok: boolean; error?: string });
  const usd = (v: number) => (v / 100).toFixed(2).replace(/\.00$/, "");

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold text-teal-950">Pricing &amp; tutor pay</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
        Platform-wide and admin-only: students always pay these prices, and tutors earn a fixed contract fee
        per completed lesson — credited to their wallet the moment they end the lesson. A tutor&apos;s own
        contract fee (Admin → Tutors → Edit) overrides the default fee. Quality bonuses are configured
        separately in Admin → Teacher bonuses.
      </p>
      {state.ok && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved. New prices and fees apply immediately.</p>}
      {state.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">Student prices must be at least US$1.</p>}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <fieldset className="rounded-2xl bg-slate-50 p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Student prices (USD)</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className={lab}>25-minute lesson<input name="student25" type="number" min={1} max={1000} step={0.5} defaultValue={usd(initial.student25)} className={inp} /></label>
            <label className={lab}>50-minute lesson<input name="student50" type="number" min={1} max={1000} step={0.5} defaultValue={usd(initial.student50)} className={inp} /></label>
          </div>
        </fieldset>
        <fieldset className="rounded-2xl bg-teal-50/70 p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-teal-600">Default tutor pay per lesson (USD)</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className={lab}>25-minute lesson<input name="fee25" type="number" min={0} max={1000} step={0.5} defaultValue={usd(initial.fee25)} className={inp} /></label>
            <label className={lab}>50-minute lesson<input name="fee50" type="number" min={0} max={1000} step={0.5} defaultValue={usd(initial.fee50)} className={inp} /></label>
          </div>
        </fieldset>
      </div>

      <button type="submit" disabled={pending} className="mt-5 rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-900 disabled:opacity-50">
        {pending ? "Saving…" : "Save pricing"}
      </button>
    </form>
  );
}
