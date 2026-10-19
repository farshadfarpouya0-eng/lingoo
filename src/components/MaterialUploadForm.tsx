"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { createMaterial } from "@/lib/feature-actions";

type Result = { ok: boolean; error?: string } | null;

async function uploadToPrivateStorage(file: File, metadata: { purpose: "material"; materialKind: string }) {
  const response = await fetch("/api/private-files/upload/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ ...metadata, fileName: file.name, mimeType: file.type, size: file.size }),
  });
  const ticket = await response.json() as { signedUrl?: string; reference?: string; contentType?: string; error?: string };
  if (!response.ok || !ticket.signedUrl || !ticket.reference || !ticket.contentType) {
    throw new Error(ticket.error || "Could not prepare the private upload. Check that private storage is configured.");
  }
  const uploaded = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": ticket.contentType, "x-upsert": "false" },
    body: file,
    cache: "no-store",
  });
  if (!uploaded.ok) throw new Error("Private storage rejected the upload. Check the bucket CORS settings and retry.");
  return ticket.reference;
}

export default function MaterialUploadForm() {
  const [state, setState] = useState<Result>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size < 1) {
      setState({ ok: false, error: "Choose a file to upload." });
      return;
    }
    setState(null);
    setPending(true);
    try {
          const fileRef = await uploadToPrivateStorage(file, { purpose: "material", materialKind: String(formData.get("kind") || "") });
          formData.delete("file");
          formData.set("fileRef", fileRef);
          const result = await createMaterial(formData);
          setState(result);
          if (result.ok) form.reset();
    } catch (error) {
      setState({ ok: false, error: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setPending(false);
    }
  }
  return <form onSubmit={onSubmit} encType="multipart/form-data" className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
    <h2 className="md:col-span-2 text-lg font-bold text-teal-950">Add a material</h2>
    <input name="title" required maxLength={160} placeholder="Title" className="rounded-xl border p-3 text-sm" />
    <select name="kind" className="rounded-xl border p-3 text-sm" defaultValue="textbook">
      <option value="textbook">Textbook / PDF</option><option value="audio">Audio</option><option value="worksheet">Worksheet</option>
    </select>
    <label className="md:col-span-2 text-sm font-medium text-slate-700">Private file upload (max 25 MB)
      <input name="file" type="file" required accept=".pdf,.epub,.txt,.mp3,.wav,.ogg,.m4a,.aac,.jpg,.jpeg,.png,.webp" className="mt-2 block w-full rounded-xl border p-3 text-sm" />
    </label>
    <input name="coverUrl" type="url" placeholder="Optional cover image URL (HTTPS)" className="rounded-xl border p-3 text-sm" />
    <input name="language" placeholder="Language" defaultValue="English" className="rounded-xl border p-3 text-sm" />
    <input name="level" placeholder="Level (A1–C2)" defaultValue="A1" className="rounded-xl border p-3 text-sm" />
    <label className="text-sm text-slate-600">Price in cents (0 for free)
      <input name="price" type="number" min="0" max="10000000" step="1" defaultValue="0" className="mt-1 block w-full rounded-xl border p-3 text-sm" />
    </label>
    <textarea name="description" placeholder="Description" maxLength={2000} rows={3} className="rounded-xl border p-3 text-sm md:col-span-2" />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isFree" defaultChecked /> Free material</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked /> Publish immediately</label>
    {state && <p role={state.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm md:col-span-2 ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{state.ok ? "Material saved successfully." : state.error || "Could not save this material."}</p>}
    <button type="submit" disabled={pending} className="rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-60 md:col-span-2">{pending ? "Uploading and saving…" : "Save material"}</button>
  </form>;
}
