"use client";
import { useState, useActionState } from "react";
import { adjustStudentBalance, deleteStudent } from "@/lib/admin-actions";
import type { T } from "@/lib/i18n";

export default function StudentTools({ id, balance, suspended, t }: { id: number; balance: number; suspended: boolean; t: T }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [balState, balAction, balPending] = useActionState(adjustStudentBalance, { ok: false } as { ok?: boolean; error?: string; balance?: number });
  const [delState, delAction, delPending] = useActionState(deleteStudent, { ok: false } as { ok?: boolean; error?: string });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={balAction as unknown as (fd: FormData) => Promise<void>} onSubmit={e => setAmount("")} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input name="delta" value={amount} onChange={e => setAmount(e.target.value)} type="number" step={0.01} placeholder="+/- $" aria-label="Balance adjustment in USD" className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
        <input name="note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Reason" aria-label="Adjustment reason for audit history" className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
        <button disabled={balPending || !amount} className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-40">{balPending ? "…" : "Apply"}</button>
      </form>
      {balState.error && <span role="alert" className="text-xs text-red-500">Check amount and account.</span>}
      {balState.ok && <span role="status" className="text-xs text-emerald-700">Updated: ${((balState.balance || 0) / 100).toFixed(2)}</span>}
      <form action={delAction as unknown as (fd: FormData) => Promise<void>} onSubmit={e => { if (!confirm("Delete this student? This cannot be undone.")) e.preventDefault(); }}>
        <input type="hidden" name="id" value={id} />
        <button disabled={delPending} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40">{delPending ? "…" : "Delete"}</button>
      </form>
      {suspended && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Suspended</span>}
    </div>
  );
}
