"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { resetBranding, saveBranding } from "@/lib/branding-actions";
import type { Branding } from "@/lib/branding";

const input = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const label = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

const LANGS: { code: "en" | "zh" | "ja"; name: string }[] = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
];

export default function BrandingForm({ branding }: { branding: Branding }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: { ok?: boolean; error?: string }, fd: FormData) => {
    const r = await saveBranding(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, {} as { ok?: boolean; error?: string });

  const [logo, setLogo] = useState(branding.logoUrl);
  const [name, setName] = useState(branding.brandName);

  return (
    <div className="space-y-5">
      {/* live preview */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-5">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Preview</span>
        <span className="inline-flex items-center gap-2.5">
          <span
            className="grid place-items-center overflow-hidden"
            style={{ width: 36, height: 38, borderRadius: "12px 12px 12px 5px", background: logo ? "#fff" : "#143e37",
              boxShadow: logo ? "inset 0 0 0 1px rgba(20,62,55,.1)" : "0 2px 10px rgba(20,62,55,.25)" }}
          >
            {logo ? (
              <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <svg viewBox="0 0 32 36" width={24} height={26} fill="none">
                <ellipse cx="16" cy="14.8" rx="12.4" ry="11.6" fill="#e8cd9c" />
                <path d="M8.6 22.6 6.7 32l8.2-6.1Z" fill="#e8cd9c" />
                <path d="M11 12.4h10M11 17.4h7.2" stroke="#143e37" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <b className="text-xl tracking-tight text-teal-950">{name || "Lingorain"}</b>
        </span>
      </div>

      <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-teal-950">Brand</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Brand name
            <input name="brandName" value={name} onChange={e => setName(e.target.value)} maxLength={40} className={input} />
          </label>
          <label className={label}>
            Logo URL <span className="font-normal normal-case text-slate-400">(https:// or /images/logo.svg)</span>
            <input name="logoUrl" value={logo} onChange={e => setLogo(e.target.value)} maxLength={500} placeholder="/images/logo.svg" className={input} />
          </label>
        </div>

        {LANGS.map(l => (
          <fieldset key={l.code} className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <legend className="px-2 text-[11px] font-bold uppercase tracking-widest text-teal-800">{l.name}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Hero title
                <input name={`heroTitle_${l.code}`} defaultValue={branding.heroTitle[l.code]} maxLength={120} className={input} />
              </label>
              <label className={label}>
                Hero accent (italic line)
                <input name={`heroAccent_${l.code}`} defaultValue={branding.heroAccent[l.code]} maxLength={120} className={input} />
              </label>
              <label className={`${label} sm:col-span-2`}>
                Hero intro
                <textarea name={`intro_${l.code}`} defaultValue={branding.intro[l.code]} maxLength={400} rows={2} className={input} />
              </label>
              <label className={`${label} sm:col-span-2`}>
                Footer note
                <input name={`footerNote_${l.code}`} defaultValue={branding.footerNote[l.code]} maxLength={200} className={input} />
              </label>
            </div>
          </fieldset>
        ))}

        {state.error === "logo" && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            The logo must be an https:// link or a path inside the site, e.g. <code>/images/logo.svg</code>.
          </p>
        )}
        {state.ok && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Branding saved.</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button disabled={pending} className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
            {pending ? "Saving…" : "Save branding"}
          </button>
          <button
            type="button"
            onClick={async () => { if (confirm("Reset the logo and all hero text to the defaults?")) { await resetBranding(); router.refresh(); } }}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Reset to defaults
          </button>
        </div>
      </form>
    </div>
  );
}