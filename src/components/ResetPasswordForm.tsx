"use client";
import { useActionState } from "react";
import { resetPassword } from "@/lib/auth-flows";
const input = "w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500";
export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null as { error?: string } | null);
  return <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-5 space-y-3">
    <input type="hidden" name="token" value={token} />
    <label className="block text-sm font-semibold text-slate-700" htmlFor="new-password">New password</label>
    <input id="new-password" name="password" type="password" minLength={12} maxLength={200} autoComplete="new-password" required className={input} />
    <p className="text-xs text-slate-500">Use at least 12 characters. All existing sessions will be signed out.</p>
    {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error === "password" ? "Password must be between 12 and 200 characters." : "This reset link is invalid, expired or already used. Request a new one."}</p>}
    <button disabled={pending} className="w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-60">{pending ? "Updating…" : "Update password"}</button>
  </form>;
}
