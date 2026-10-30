import Link from "next/link";
import VerificationForm, { ConfirmEmailForm } from "@/components/VerificationForm";

export const dynamic = "force-dynamic";
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string }> }) {
  const { token, email } = await searchParams;
  return <main className="mx-auto max-w-lg px-4 py-16"><div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
    <h1 className="text-2xl font-black text-teal-950">Verify your email</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">Use the link sent to your email. Verification links expire after 24 hours and can only be used once. Open this page and confirm below; loading the link alone will not consume it.</p>
    {token ? <><ConfirmEmailForm token={token} /><p className="mt-4 text-sm"><Link href="/login" className="text-teal-700 underline">Back to sign in</Link></p><div className="mt-6 border-t border-slate-100 pt-5"><p className="text-sm font-semibold text-slate-700">Need a fresh link?</p><VerificationForm initialEmail={email || ""} /></div></> : <><VerificationForm initialEmail={email || ""} /><p className="mt-4 text-sm"><Link href="/login" className="text-teal-700 underline">Back to sign in</Link></p></>}
  </div></main>;
}
