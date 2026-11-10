"use client";

import { useState } from "react";

export default function CopyTextButton({ value, label = "Copy address" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-teal-800 hover:bg-teal-50">{copied ? "Copied ✓" : label}</button>;
}
