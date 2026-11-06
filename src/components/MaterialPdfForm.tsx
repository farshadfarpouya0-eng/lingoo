"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { updateMaterialPdf } from "@/lib/feature-actions";
import { uploadMaterialAsset } from "@/lib/material-upload-client";

export default function MaterialPdfForm({ id, hasPdf }: { id: number; hasPdf: boolean }) {
  const router = useRouter();
  const [pdfRef, setPdfRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, action, pending] = useActionState(async (_previous: unknown, fd: FormData) => {
    const result = await updateMaterialPdf(fd);
    if (result?.ok) { setPdfRef(""); router.refresh(); }
    return result;
  }, null as { ok?: boolean; error?: string } | null);
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { setPdfRef(await uploadMaterialAsset(file, "textbook")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setBusy(false); }
  };
  return <details className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 sm:w-auto sm:min-w-64"><summary className="cursor-pointer text-xs font-bold text-teal-800">{hasPdf ? "Replace attached PDF" : "Attach missing PDF"}</summary><form action={action as unknown as (fd: FormData) => Promise<void>} className="mt-3 grid gap-2"><input type="hidden" name="id" value={id}/><input type="hidden" name="pdfRef" value={pdfRef}/><label className="text-xs font-semibold text-slate-600">PDF file (max 25 MB)<input type="file" accept="application/pdf,.pdf" onChange={event => void upload(event.target.files?.[0])} className="mt-1 block w-full text-xs"/></label><label className="text-xs font-semibold text-slate-600">Page count (optional)<input name="pageCount" type="number" min={1} max={10000} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"/></label>{pdfRef && <p className="text-[11px] font-semibold text-emerald-700">✓ PDF uploaded privately</p>}{busy && <p className="text-[11px] text-teal-700">Uploading…</p>}{error && <p role="alert" className="text-[11px] text-red-600">{error}</p>}{state?.error && <p role="alert" className="text-[11px] text-red-600">{state.error}</p>}{state?.ok && <p role="status" className="text-[11px] text-emerald-700">PDF attached.</p>}<button disabled={busy || pending || !pdfRef} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Save PDF attachment</button></form></details>;
}
