"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { uploadTeacherDocument } from "@/lib/feature-actions";

type Result = { ok: boolean; error?: string } | null;

export default function TeacherDocumentUploadForm() {
  const [state, setState] = useState<Result>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1) {
      setState({ ok: false, error: "Choose a document to upload." });
      return;
    }
    setState(null);
    setPending(true);
    try {
          const prepare = await fetch("/api/private-files/upload/prepare", {
            method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ purpose: "document", fileName: file.name, mimeType: file.type, size: file.size }),
          });
          const ticket = await prepare.json() as { signedUrl?: string; reference?: string; contentType?: string; error?: string };
          if (!prepare.ok || !ticket.signedUrl || !ticket.reference || !ticket.contentType) {
            throw new Error(ticket.error || "Could not prepare the private upload. Check that private storage is configured.");
          }
          const uploaded = await fetch(ticket.signedUrl, {
            method: "PUT", headers: { "Content-Type": ticket.contentType, "x-upsert": "false" }, body: file, cache: "no-store",
          });
          if (!uploaded.ok) throw new Error("Private storage rejected the upload. Check the bucket CORS settings and retry.");
          formData.delete("file");
          formData.set("fileRef", ticket.reference);
          const result = await uploadTeacherDocument(formData);
          setState(result);
          if (result.ok) form.reset();
    } catch (error) {
      setState({ ok: false, error: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={onSubmit} encType="multipart/form-data" className="mt-5 grid gap-3 sm:grid-cols-2">
    <h3 className="sm:col-span-2 font-bold text-teal-950">Upload teacher documents</h3>
    <select name="documentType" className="rounded-xl border p-3 text-sm" defaultValue="identity">
      <option value="identity">Identity document (required for verification)</option><option value="university">University certificate (optional)</option><option value="teaching">Teaching certificate (optional)</option><option value="other">Other credential (optional)</option>
    </select>
    <label className="text-sm font-medium text-slate-700">Private document upload (PDF/JPEG/PNG/WebP, max 25 MB)
      <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" className="mt-2 block w-full rounded-xl border p-3 text-sm" />
    </label>
    <p className="sm:col-span-2 text-xs leading-5 text-slate-500">Documents are stored privately and remain pending until an administrator reviews them. Never upload somebody else&apos;s identity document.</p>
    {state && <p role={state.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm sm:col-span-2 ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{state.ok ? "Document submitted for review." : state.error || "Upload failed."}</p>}
    <button type="submit" disabled={pending} className="rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 sm:col-span-2">{pending ? "Uploading and submitting…" : "Submit document for review"}</button>
  </form>;
}
