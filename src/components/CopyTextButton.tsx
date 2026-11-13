"use client";
import { useEffect, useId, useRef, useState } from "react";

export default function CopyTextButton({ value, label = "Copy address", copiedLabel = "Copied", fallbackLabel = "Automatic copying is unavailable. Select and copy the text below." }: {
  value: string; label?: string; copiedLabel?: string; fallbackLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (manual) { input.current?.focus(); input.current?.select(); } }, [manual]);
  async function copy() {
    setCopied(false); setManual(false);
    let ok = false;
    try { await navigator.clipboard.writeText(value); ok = true; } catch {
      const field = document.createElement("textarea");
      field.value = value; field.style.position = "fixed"; field.style.opacity = "0"; field.readOnly = true;
      const previous = document.activeElement;
      document.body.appendChild(field);
      try { field.focus(); field.select(); ok = document.execCommand("copy"); } catch { /* manual fallback below */ }
      finally { field.remove(); if (previous instanceof HTMLElement) previous.focus(); }
    }
    if (ok) { setCopied(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000); }
    else setManual(true);
  }
  return <span className="inline-flex max-w-full flex-col items-start gap-2">
    <button type="button" onClick={copy} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-50">{copied ? `✓ ${copiedLabel}` : label}</button>
    <span role="status" className="sr-only">{copied ? copiedLabel : ""}</span>
    {manual && <span className="block w-full rounded-lg bg-slate-100 p-2"><label htmlFor={id} className="block text-[10px] leading-4 text-slate-600">{fallbackLabel}</label><input id={id} ref={input} readOnly dir="ltr" value={value} onFocus={e => e.currentTarget.select()} className="mt-1 w-full min-w-0 rounded border border-slate-200 bg-white p-2 text-xs" /></span>}
  </span>;
}
