import Link from "next/link";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";
export const metadata = { title: "Forgot password | Lingorain" };
export default function ForgotPasswordPage() { return <main className="mx-auto max-w-lg px-4 py-16"><div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"><h1 className="text-2xl font-black text-teal-950">Forgot your password?</h1><p className="mt-3 text-sm text-slate-600">Enter the email address linked to your account. If it exists, we will send a one-time reset link.</p><ForgotPasswordForm /><p className="mt-4 text-sm"><Link href="/login" className="text-teal-700 underline">Back to sign in</Link></p></div></main>; }
