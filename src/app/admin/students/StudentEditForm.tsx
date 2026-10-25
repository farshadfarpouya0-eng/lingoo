"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { adjustStudentBalance, deleteStudent, updateStudent } from "@/lib/admin-actions";
import type { T } from "@/lib/i18n";
const inp = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const lab = "block text-xs font-semibold text-slate-500";
export type StudentRow = { id: number; name: string; email: string; avatar: string; nativeLang: string; balance: number; level: string; suspended: boolean };
const ERRORS: Record<string, string> = {
  id: "Invalid student.", not_found: "This student no longer exists.", name: "Please enter a name.",
  email: "Please enter a valid email address.", email_taken: "Another account already uses this email.",
  avatar: "The photo must be an https:// link.",
};

export default function StudentEditForm({ row, t }: { row: StudentRow; t: T }) {
  const [state, action, pending] = useActionState(updateStudent, { ok: false } as { ok: boolean; error?: string });
  const [delState, delAction, delPending] = useActionState(deleteStudent, { ok: false } as { ok?: boolean; error?: string });
  return (
    <div className="space-y-5">
      <form action={action as unknown as (fd: FormData) => Promise<void>} className="space-y-4">
        <input type="hidden" name="id" value={row.id} />
        {state.ok && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved.</p>}
        {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{ERRORS[state.error] ?? "Could not save."}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lab}>{t.name}<input name="name" required maxLength={60} defaultValue={row.name} className={inp} /></label>
          <label className={lab}>{t.email}<input name="email" type="email" required maxLength={254} defaultValue={row.email} className={inp} /></label>
          <label className={lab}>{t.level}<select name="level" defaultValue={row.level} className={inp}>{["A1", "A2", "B1", "B2", "C1", "C2"].map(l => <option key={l}>{l}</option>)}</select></label>
          <label className={lab}>{t.nativeLang}<select name="nativeLang" defaultValue={row.nativeLang} className={inp}><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option></select></label>
          <label className={`${lab} sm:col-span-2`}>Photo link (https://…)<input name="avatar" maxLength={500} defaultValue={row.avatar} className={inp} /></label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-red-700"><input type="checkbox" name="suspended" defaultChecked={row.suspended} className="h-4 w-4 accent-red-600" />Suspended (cannot sign in)</label>
        <p className="text-xs text-slate-500">Wallet balance: <b>{usd(row.balance)}</b> · <Link href="/admin/accounts" className="font-semibold text-teal-700 underline">Reset password</Link></p>
        <div className="flex flex-wrap gap-3">
          <button disabled={pending} className="rounded-xl bg-teal-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">{pending ? "Saving…" : t.save}</button>
          <Link href="/admin/students" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500">Back to students</Link>
        </div>
      </form>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
        <BalanceTool id={row.id} t={t} />
        <form action={delAction as unknown as (fd: FormData) => Promise<void>} onSubmit={e => { if (!confirm("Delete this student? This cannot be undone.")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={row.id} />
          <button disabled={delPending} className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">{delPending ? "…" : "Delete student"}</button>
        </form>
        {delState.error && <p className="text-xs font-semibold text-red-600">Could not delete: this student has lessons or payments. Suspend the account instead.</p>}
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
      <span className="pl-1 text-xs font-semibold text-slate-500">Adjust ({t.balance})</span>
      <input name="delta" value={amount} onChange={e => setAmount(e.target.value)} type="number" step={0.01} placeholder="+/- amount" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500" />
      <button disabled={pending || !amount} className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-40">{pending ? "…" : "Apply"}</button>
    </form>
  );
}
function usd(c: number) { return `$${(c / 100).toFixed(2)}`; }
