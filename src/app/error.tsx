"use client";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="mx-auto max-w-lg px-5 py-24 text-center">
    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700">Lingorain</p>
    <h1 className="mt-5 text-3xl font-bold tracking-tight text-teal-950">This page could not load</h1>
    <p className="mt-4 text-sm leading-7 text-slate-500">A temporary site error occurred. Reload the page to retry.</p>
    {error.digest && <p className="mt-3 text-xs text-slate-400">Error reference: {error.digest}</p>}
    <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
      <button onClick={() => window.location.reload()} className="rounded-full bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900">Reload page</button>
      <button onClick={reset} className="rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-500 hover:border-teal-300">Retry</button>
      <Link href="/" prefetch={false} className="px-4 py-3 text-sm font-semibold text-teal-700">Back to home</Link>
    </div>
  </section>;
}
