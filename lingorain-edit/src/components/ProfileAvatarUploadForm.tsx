"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { saveProfileAvatar } from "@/lib/feature-actions";

type Result = { ok: boolean; error?: string } | null;

export default function ProfileAvatarUploadForm({ avatar }: { avatar: string | null }) {
  const [state, setState] = useState<Result>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size < 1) {
      setState({ ok: false, error: "Choose a JPG, PNG, or WebP image." });
      return;
    }
    setState(null);
    setPending(true);
    try {
      const prep = await fetch("/api/private-files/upload/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ purpose: "avatar", fileName: file.name, mimeType: file.type, size: file.size }),
      });
      const ticket = await prep.json() as { signedUrl?: string; reference?: string; contentType?: string; error?: string };
      if (!prep.ok || !ticket.signedUrl || !ticket.reference || !ticket.contentType) {
        throw new Error(ticket.error || "Could not prepare private image upload. Check the storage configuration.");
      }
      const uploaded = await fetch(ticket.signedUrl, {
        method: "PUT", headers: { "Content-Type": ticket.contentType, "x-upsert": "false" }, body: file, cache: "no-store",
      });
      if (!uploaded.ok) throw new Error("Storage rejected the picture. Check bucket CORS and retry.");
      data.delete("file");
      data.set("fileRef", ticket.reference);
      const result = await saveProfileAvatar(data);
      setState(result);
      if (result.ok) form.reset();
    } catch (error) {
      setState({ ok: false, error: error instanceof Error ? error.message : "Profile picture upload failed." });
    } finally {
      setPending(false);
    }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-center gap-4">
      <img src={avatar || ""} alt="Profile picture" width={64} height={64} className="h-16 w-16 rounded-2xl bg-slate-100 object-cover" />
      <div><h2 className="font-bold text-teal-950">Profile picture</h2><p className="mt-1 text-xs leading-5 text-slate-500">Upload a JPEG, PNG, or WebP image up to 5 MB. Your picture appears on your public tutor profile or account UI.</p></div>
    </div>
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="block flex-1 text-xs font-semibold text-slate-600">Choose image
        <input name="file" type="file" required accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm" />
      </label>
      <button type="submit" disabled={pending} className="rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{pending ? "Uploading…" : "Update picture"}</button>
    </form>
    {state && <p role={state.ok ? "status" : "alert"} className={`mt-3 rounded-xl p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{state.ok ? "Profile picture updated." : state.error || "Upload failed."}</p>}
  </section>;
}
