"use client";
import { useState, useActionState } from "react";
import { cancelLesson, createTeacher, deleteStudent, deleteTeacher, adjustStudentBalance, processPayout } from "@/lib/admin-actions";

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold";
const btnDanger = `${btn} bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50`;
const btnOk = `${btn} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50`;
const input = "rounded-lg border border-slate-200 px-2 py-1.5 text-xs";

export function PayoutActions({ id }: { id: number }) {
  const [state, action, pending] = useActionState(processPayout, { ok: false });
  const [note, setNote] = useState("");
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="note" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" className={input} />
      <button name="action" value="paid" disabled={pending} className={btnOk}>Paid</button>
      <button name="action" value="rejected" disabled={pending} className={btnDanger}>Reject & refund</button>
    </form>
  );
}

export function CancelLesson({ id }: { id: number }) {
  const [state, action, pending] = useActionState(cancelLesson, { ok: false });
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} onSubmit={e => { if (!confirm("Cancel this lesson and refund the student?")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={btnDanger}>{pending ? "…" : "Cancel & refund"}</button>
    </form>
  );
}

export function CreateTutorForm() {
  const [state, action, pending] = useActionState(createTeacher, { ok: false });
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-2xl bg-slate-50 p-4">
      <h3 className="mb-3 text-sm font-bold text-teal-950">Add tutor</h3>
      {state?.ok === false && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-600">Please enter a name and a valid email.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="name" required placeholder="Full name" className={input} />
        <input name="email" type="email" required placeholder="email@example.com" className={input} />
      </div>
      <button disabled={pending} className="mt-3 rounded-xl bg-teal-800 px-5 py-2 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
        {pending ? "Adding…" : "Add tutor"}
      </button>
    </form>
  );
}

export function DeleteTutor({ id }: { id: number }) {
  const [state, action, pending] = useActionState(deleteTeacher, { ok: false });
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} onSubmit={e => { if (!confirm("Delete this tutor? This cannot be undone.")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={btnDanger}>{pending ? "…" : "Delete"}</button>
    </form>
  );
}

export function DeleteStudent({ id }: { id: number }) {
  const [state, action, pending] = useActionState(deleteStudent, { ok: false });
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} onSubmit={e => { if (!confirm("Delete this student? This cannot be undone.")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className={btnDanger}>{pending ? "…" : "Delete"}</button>
    </form>
  );
}

export function AdjustBalance({ id }: { id: number }) {
  const [state, action, pending] = useActionState(adjustStudentBalance, { ok: false } as { ok?: boolean; error?: string; balance?: number });
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="flex flex-wrap items-center gap-1.5" onSubmit={() => setAmount("")}>
      <input type="hidden" name="id" value={id} />
      <input name="delta" value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" placeholder="+/- USD" aria-label="Balance adjustment amount in USD" className={`${input} w-24`} />
      <input name="note" value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Reason (audit note)" aria-label="Reason for balance adjustment" className={`${input} w-36`} />
      <button disabled={pending || !amount} className={btnOk}>{pending ? "…" : "Adjust"}</button>
      {state.error && <span role="alert" className="text-[11px] text-red-600">Invalid adjustment</span>}
      {state.ok && <span role="status" className="text-[11px] text-emerald-700">Saved · {((state.balance || 0)/100).toFixed(2)} USD</span>}
    </form>
  );
}
