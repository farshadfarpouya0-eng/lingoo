"use client";

import { useState } from "react";
import { saveTeacherVideo, clearTeacherVideo, type VideoKind } from "@/lib/teacher-video-actions";

const MAX_BYTES = 25 * 1024 * 1024;

export default function TeacherVideoUpload({ kind, title, hint, previewSrc }: {
  kind: VideoKind; title: string; hint: string; previewSrc: string;
}) {
  const [busy, setBusy] = useState<"" | "upload" | "remove">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [hasVideo, setHasVideo] = useState(Boolean(previewSrc));
  const [progress, setProgress] = useState("");

  async function upload(file: File) {
    setMessage(null);
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setMessage({ ok: false, text: "Choose an MP4 or WebM video." });
      return;
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      setMessage({ ok: false, text: "The video must be between 1 byte and 25 MB. Export a shorter or lower-resolution copy and try again." });
      return;
    }
    setBusy("upload");
    try {
      setProgress("Preparing upload…");
      const prep = await fetch("/api/private-files/upload/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ purpose: "video", videoKind: kind, fileName: file.name, mimeType: file.type, size: file.size }),
      });
      const ticket = await prep.json() as { signedUrl?: string; reference?: string; contentType?: string; error?: string };
      if (!prep.ok || !ticket.signedUrl || !ticket.reference || !ticket.contentType) {
        throw new Error(ticket.error || "Could not prepare the upload. Check the private storage settings.");
      }
      setProgress("Uploading video…");
      const uploaded = await fetch(ticket.signedUrl, {
        method: "PUT", headers: { "Content-Type": ticket.contentType, "x-upsert": "false" }, body: file, cache: "no-store",
      });
      if (!uploaded.ok) throw new Error("Storage rejected the video. Check the bucket settings and try again.");
      setProgress("Checking video…");
      const saved = await saveTeacherVideo(kind, ticket.reference);
      if (!saved.ok) throw new Error(saved.error || "The video could not be saved.");
      setHasVideo(true);
      setVersion(v => v + 1);
      setMessage({ ok: true, text: "Video saved. Students who are matched with you will see it." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function remove() {
    if (!window.confirm("Remove this video from your profile?")) return;
    setBusy("remove");
    setMessage(null);
    const result = await clearTeacherVideo(kind);
    setBusy("");
    if (result.ok) {
      setHasVideo(false);
      setMessage({ ok: true, text: "Video removed." });
    } else {
      setMessage({ ok: false, text: result.error || "Could not remove the video." });
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-teal-950">{title}</h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{hint}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${hasVideo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {hasVideo ? "Uploaded" : "Not uploaded"}
        </span>
      </div>

      {hasVideo && previewSrc ? (
        <video
          key={`${previewSrc}-${version}`}
          controls
          preload="metadata"
          playsInline
          className="mt-4 aspect-video w-full rounded-xl bg-teal-950 object-contain"
        >
          <source src={previewSrc} />
        </video>
      ) : (
        <div className="mt-4 grid aspect-video w-full place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-400">
          No video yet
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className={`inline-flex cursor-pointer items-center rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-teal-900 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy === "upload" ? (progress || "Uploading…") : hasVideo ? "Replace video" : "Upload video"}
          <input
            type="file"
            accept="video/mp4,video/webm,.mp4,.webm"
            className="sr-only"
            disabled={Boolean(busy)}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }}
          />
        </label>
        {hasVideo && (
          <button type="button" onClick={remove} disabled={Boolean(busy)} className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60">
            {busy === "remove" ? "Removing…" : "Remove"}
          </button>
        )}
        <span className="text-[11px] text-slate-400">MP4 or WebM · up to 25 MB</span>
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 rounded-xl p-3 text-xs ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </p>
      )}
    </article>
  );
}
