"use client";

import { useActionState, useState } from "react";
import { saveSignupConfig } from "@/lib/admin-actions";
import type { SignupConfig } from "@/lib/signup-config";

export default function SignupPolicyForm({ initial, emailConfigured }: { initial: SignupConfig; emailConfigured: boolean }) {
  const [state, action, pending] = useActionState(saveSignupConfig, { ok: false } as { ok: boolean; error?: string });
  const [on, setOn] = useState(initial.requireEmailVerification);

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-8 rounded-3xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold text-teal-950">Sign-up &amp; email verification</h2>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
        When verification is <b>off</b>, new students and tutors are active immediately and are signed in right after
        registering. When it is <b>on</b>, a confirmation link is emailed and the account cannot sign in until it is
        confirmed — this needs the email provider (Resend) configured in Admin → Integrations.
      </p>
      {state.ok && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved. The new policy applies to sign-ups from now on.</p>}

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 hover:border-teal-300">
        <input
          type="checkbox"
          name="requireEmailVerification"
          checked={on}
          onChange={e => setOn(e.target.checked)}
          className="mt-0.5 h-5 w-5 accent-teal-700"
        />
        <span>
          <span className="block text-sm font-bold text-teal-950">Require email verification before first sign-in</span>
          <span className="mt-1 block text-xs leading-5 text-slate-500">
            {on ? "New accounts must click the emailed link first." : "Off — accounts work instantly, no email needed."}
          </span>
        </span>
      </label>

      {on && !emailConfigured && (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          Email sending is not configured yet, so nobody would receive the verification link. Configure Resend in
          Admin → Integrations before turning this on, or keep it off.
        </p>
      )}

      <button type="submit" disabled={pending} className="mt-5 rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-900 disabled:opacity-50">
        {pending ? "Saving…" : "Save sign-up policy"}
      </button>
    </form>
  );
}
