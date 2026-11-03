"use client";
import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/auth-flows";
const input = "w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500";
export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, { ok: false } as { ok: boolean });
  return <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-5 space-y-3">
    <label className="block text-sm font-semibold text-slate-700" htmlFor="reset-email">Email address</label>
    <input id="reset-email" name="email" type="email" required maxLength={254} className={input} placeholder="you@example.com" />
    <button disabled={pending} className="w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-60">{pending ? "Sending…" : "Send reset link"}</button>
    {state?.ok && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">If an account exists for that email, a password reset link has been sent.</p>}
  </form>;
}
