"use client";
import { useActionState } from "react";
import { confirmEmail, resendVerification } from "@/lib/auth-flows";
const input = "w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500";
export default function VerificationForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [state, action, pending] = useActionState(resendVerification, { ok: false } as { ok: boolean });
  return <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-5 space-y-3">
    <label className="block text-sm font-semibold text-slate-700" htmlFor="verification-email">Email address</label>
    <input id="verification-email" name="email" type="email" required maxLength={254} defaultValue={initialEmail} className={input} placeholder="you@example.com" />
    <button disabled={pending} className="w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-60">{pending ? "Sending…" : "Send verification link"}</button>
    {state?.ok && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">If the address belongs to an unverified account, a fresh link has been sent. Check your inbox and spam folder.</p>}
  </form>;
}

export function ConfirmEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmEmail, null as { verified?: boolean; error?: string } | null);
  return <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-5">
    <input type="hidden" name="token" value={token} />
    <button disabled={pending} className="rounded-xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-60">{pending ? "Verifying…" : "Confirm email address"}</button>
    {state?.verified && <p role="status" className="mt-3 text-sm text-emerald-800">Email verified. You can now sign in.</p>}
    {state?.error && <p role="alert" className="mt-3 text-sm text-red-700">This link has expired or has already been used. Request a new verification link below.</p>}
  </form>;
}
