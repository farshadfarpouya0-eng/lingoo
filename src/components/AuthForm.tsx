"use client";
import { useActionState } from "react";
import Link from "next/link";
import { login, register } from "@/lib/actions";

type L = Record<string, string>;
const input = "w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100";

export default function AuthForm({ mode, t, defaultRole, referralCode = "", showDemo = false }: { mode: "login" | "register"; t: L; defaultRole?: string; referralCode?: string; showDemo?: boolean }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : register, null as { error?: string } | null);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl shadow-teal-100">
        <h1 className="text-3xl font-black text-teal-950">{mode === "login" ? t.login : t.register}</h1>
        <form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-6 space-y-4">
          {mode === "register" && (
            <>
              <input type="hidden" name="referralCode" value={referralCode} />
              <input name="name" placeholder={t.name} required minLength={2} maxLength={60} autoComplete="name" className={input} />
              <div className="grid grid-cols-2 gap-2">
                {(["student", "teacher"] as const).map((r) => (
                  <label key={r} className="cursor-pointer">
                    <input type="radio" name="role" value={r} defaultChecked={(defaultRole === "teacher" ? "teacher" : "student") === r} className="peer sr-only" />
                    <div className="rounded-xl border-2 border-slate-200 p-3 text-center font-semibold peer-checked:border-teal-600 peer-checked:bg-teal-50 peer-checked:text-teal-800">{r === "student" ? t.student : t.teacher}</div>
                  </label>
                ))}
              </div>
              <select name="nativeLang" className={input} defaultValue="zh">
                <option value="zh">{t.nativeLang}: 中文</option>
                <option value="ja">{t.nativeLang}: 日本語</option>
                <option value="en">{t.nativeLang}: English</option>
              </select>
            </>
          )}
          <input name="email" type="email" placeholder={t.email} required maxLength={254} autoComplete="email" className={input} />
          <input name="password" type="password" placeholder={t.password} required minLength={mode === "register" ? 12 : 1} maxLength={200} autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} />
          {mode === "register" && <p className="-mt-2 text-xs text-slate-400">Use at least 12 characters. {t.passwordHint}</p>}
          {state?.error === "email_sent" && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Your account was created. Check your inbox for the verification link, then sign in. <Link className="font-bold underline" href="/verify-email">Resend verification email</Link>.</p>}
          {state?.error === "email_setup_needed" && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Your account was created but the email service is not configured yet. Ask the site administrator to configure email, then <Link className="font-bold underline" href="/verify-email">resend verification</Link>.</p>}
          {state?.error === "verify" && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Please verify your email before signing in. <Link className="font-bold underline" href="/verify-email">Resend verification email</Link>.</p>}
          {state?.error && !["email_sent", "email_setup_needed", "verify"].includes(state.error) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{t[`err_${state.error}`] ?? t.err_generic}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-teal-700 py-3 font-bold text-white hover:bg-teal-800 disabled:opacity-60">
            {pending ? "…" : mode === "login" ? t.login : t.register}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          {mode === "login" ? <>{t.noAccount} <Link href="/register" className="font-semibold text-teal-700">{t.register}</Link></> : <>{t.haveAccount} <Link href="/login" className="font-semibold text-teal-700">{t.login}</Link></>}
        </p>
        {mode === "login" && <p className="mt-3 text-center text-sm"><Link href="/forgot-password" className="font-semibold text-teal-700 underline">Forgot password?</Link></p>}
        {mode === "login" && showDemo && (
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
            <b>{t.demo}</b> (demo1234)<br />Student: student@demo.com · yuki@demo.com<br />Tutor: teacher@demo.com<br />Admin: admin@demo.com
          </div>
        )}
      </div>
    </div>
  );
}
