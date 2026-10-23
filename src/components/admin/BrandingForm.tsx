"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { resetBranding, saveBranding } from "@/lib/branding-actions";
import type { Branding } from "@/lib/branding";

const input = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const label = "text-[11px] font-bold uppercase tracking-wide text-slate-500";

/* keep in sync with LOGO_MAX in src/lib/branding.ts (not imported: that file is server-only) */
const LOGO_MAX = 300_000;
const MAX_SIDE = 256;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

const LANGS: { code: "en" | "zh" | "ja"; name: string }[] = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
];

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** Shrink raster logos in the browser so even large photos save as a small image. */
async function prepareLogo(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  if (file.type === "image/svg+xml") return dataUrl;

  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  const webp = canvas.toDataURL("image/webp", 0.92);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

const kb = (s: string) => Math.round((s.length * 3) / 4 / 1024);

export default function BrandingForm({ branding }: { branding: Branding }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(async (prev: { ok?: boolean; error?: string }, fd: FormData) => {
    const r = await saveBranding(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, {} as { ok?: boolean; error?: string });

  const [logo, setLogo] = useState(branding.logoUrl);
  const [name, setName] = useState(branding.brandName);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const uploaded = logo.startsWith("data:");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError("");
    if (!ALLOWED.includes(file.type)) return setFileError("Please choose a PNG, JPG, WebP or SVG image.");
    if (file.size > 5 * 1024 * 1024) return setFileError("The file is larger than 5 MB.");
    if (file.type === "image/svg+xml" && file.size > 150 * 1024) return setFileError("SVG logos must be under 150 KB.");
    setBusy(true);
    try {
      const out = await prepareLogo(file);
      if (out.length > LOGO_MAX) setFileError("The image is still too large after resizing. Try a simpler logo.");
      else setLogo(out);
    } catch {
      setFileError("That image could not be read. Try another file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
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
        <input type="hidden" name="logoUrl" value={logo} />

        <h2 className="text-sm font-bold text-teal-950">Brand</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Brand name
            <input name="brandName" value={name} onChange={e => setName(e.target.value)} maxLength={40} className={input} />
          </label>

          <div className={label}>
            Logo
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept={ALLOWED.join(",")} onChange={onFile} className="hidden" />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold normal-case tracking-normal text-white hover:bg-teal-900 disabled:opacity-50"
              >
                {busy ? "Processing…" : "Upload from computer"}
              </button>
              {logo && (
                <button
                  type="button"
                  onClick={() => { setLogo(""); setFileError(""); }}
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold normal-case tracking-normal text-red-600 hover:bg-red-50"
                >
                  Remove logo
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] font-normal normal-case tracking-normal text-slate-400">
              {uploaded
                ? `Uploaded image · ${kb(logo)} KB · resized to max ${MAX_SIDE}px`
                : "PNG, JPG, WebP or SVG. Square logos look best. Empty = built-in logo."}
            </p>
          </div>

          {!uploaded && (
            <label className={`${label} sm:col-span-2`}>
              …or logo link <span className="font-normal normal-case text-slate-400">(https:// or /images/logo.svg)</span>
              <input value={logo} onChange={e => setLogo(e.target.value)} maxLength={500} placeholder="https://example.com/logo.png" className={input} />
            </label>
          )}
        </div>

        {fileError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{fileError}</p>}

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

        {state.error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error === "logo_size"
              ? "The logo is too large. Upload a smaller image."
              : "The logo must be an uploaded image, an https:// link, or a path like /images/logo.svg."}
          </p>
        )}
        {state.ok && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Branding saved.</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button disabled={pending || busy} className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
            {pending ? "Saving…" : "Save branding"}
          </button>
          <button
            type="button"
            onClick={async () => { if (confirm("Reset the logo and all hero text to the defaults?")) { await resetBranding(); setLogo(""); router.refresh(); } }}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Reset to defaults
          </button>
        </div>
      </form>
    </div>
  );
}
