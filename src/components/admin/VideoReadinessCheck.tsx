"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

type Check = { name: string; ok: boolean; detail: string };
export default function VideoReadinessCheck() {
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true); setChecks([]); setError("");
    try {
      const response = await fetch("/api/admin/video-check", { method: "POST", cache: "no-store" });
      const data = await response.json() as { checks?: Check[]; scriptUrl?: string; error?: string };
      if (!response.ok || !data.checks) throw new Error(data.error || "The check could not run. Try again.");
      setChecks(data.checks);
      if (data.scriptUrl) {
        const source = new URL(data.scriptUrl);
        if (source.protocol !== "https:" || !source.pathname.endsWith("/external_api.js") || source.search || source.hash) throw new Error("Unexpected video API address.");
        const browserOk = await new Promise<boolean>(resolve => {
          const script = document.createElement("script");
          const finish = (ok: boolean) => { clearTimeout(timer); script.remove(); resolve(ok); };
          const timer = window.setTimeout(() => finish(false), 12000);
          script.onload = () => finish(typeof window.JitsiMeetExternalAPI === "function");
          script.onerror = () => finish(false);
          script.src = source.href; script.async = true; document.head.appendChild(script);
        });
        setChecks(previous => [...previous, { name: "Video API from this browser", ok: browserOk, detail: browserOk ? "This browser can load the same API used by the classroom." : "This browser could not load the API. Reload after saving settings, then check browser/network restrictions or Content Security Policy." }]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "The check could not run."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5" aria-label="Classroom diagnostics">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-teal-950">Classroom readiness check</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">Save your settings first. Check each connection stage without exposing credentials or changing existing lessons.</p></div><button type="button" onClick={run} disabled={busy} className="rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? "Checking classroom…" : "Run classroom checks"}</button></div>
    {checks.length > 0 && <ul aria-live="polite" className="mt-4 space-y-2">{checks.map(check => <li key={check.name} className="flex gap-3 rounded-xl border border-slate-100 bg-white p-3"><Icon name={check.ok ? "check" : "alert"} className={`mt-0.5 shrink-0 ${check.ok ? "text-teal-700" : "text-amber-700"}`} width={17} height={17} /><div><b className="text-xs text-teal-950">{check.name}</b><p className="mt-1 text-[11px] leading-5 text-slate-500">{check.detail}</p></div></li>)}</ul>}
    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
    <p className="mt-3 text-[11px] leading-6 text-slate-500">Passing these checks does not verify provider billing, the registered public key, or a live audio/video call. <Link href="/admin/testing" className="font-semibold text-teal-700 underline">Join a test lesson as teacher and student</Link> to verify the final connection.</p>
  </section>;
}
