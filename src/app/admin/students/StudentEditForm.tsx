"use client";
import { useActionState } from "react";
import Link from "next/link";
import { adjustStudentBalance, deleteStudent } from "@/lib/admin-actions";
import type { T } from "@/lib/i18n";
import { useState } from "react";
const inp = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
export type StudentRow = { id: number; name: string; email: string; balance: number; level: string; suspended: boolean };

export default function StudentEditForm({ row, t }: { row: StudentRow; t: T }) {
  const [delState, delAction, delPending] = useActionState(deleteStudent, { ok: false } as { ok?: boolean; error?: string });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-500">{t.name}<input readOnly value={row.name} className={`${inp} bg-slate-50`} /></label>
        <label className="block text-xs font-semibold text-slate-500">{t.email}<input readOnly value={row.email} className={`${inp} bg-slate-50`} /></label>
        <label className="block text-xs font-semibold text-slate-500">Balance (${usd(row.balance)})<input readOnly value={usd(row.balance)} className={`${inp} bg-slate-50`} /></label>
        <label className="block text-xs font-semibold text-slate-500">{t.level}<input readOnly value={row.level} className={`${inp} bg-slate-50`} /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <BalanceTool id={row.id} t={t} />
        <form action={delAction as unknown as (fd: FormData) => Promise<void>} onSubmit={e => { if (!confirm("Delete this student? This cannot be undone.")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={row.id} />
          <button disabled={delPending} className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">{delPending ? "…" : "Delete student"}</button>
        </form>
        <Link href="/admin/students" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500">Cancel</Link>
      </div>
    </div>
  );
}

function BalanceTool({ id, t }: { id: number; t: T }) {
  const [amount, setAmount] = useState("");
  const [, action, pending] = useActionState(adjustStudentBalance, { ok: false } as { ok?: boolean; error?: string; balance?: number });
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} onSubmit={() => setAmount("")} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
      <input type="hidden" name="id" value={id} />
      <span className="pl-1 text-xs font-semibold text-slate-500">Adjust (${t.balance})</span>
      <input name="delta" value={amount} onChange={e => setAmount(e.target.value)} type="number" step={0.01} placeholder="+/- amount" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
      <button disabled={pending || !amount} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-40">{pending ? "…" : "Apply"}</button>
    </form>
  );
}
function usd(c: number) { return `$${(c / 100).toFixed(2)}`; }
