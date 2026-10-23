"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createMaterial } from "@/lib/feature-actions";
import type { CourseUnit } from "./InteractiveCourseReader";

const input = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read_failed"));
    r.readAsDataURL(file);
  });
}

export default function MaterialUploadForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"both" | "self" | "tutor">("both");
  const [coverUrl, setCoverUrl] = useState("");
  const [units, setUnits] = useState<CourseUnit[]>([
    { title: "Lesson 1: Introduction & Dialogue", content: "", audioUrl: "", imageUrl: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [state, action, pending] = useActionState(async (_prev: unknown, fd: FormData) => {
    const r = await createMaterial(fd);
    if (r?.ok) {
      setUnits([{ title: "Lesson 1: Introduction & Dialogue", content: "", audioUrl: "", imageUrl: "" }]);
      setCoverUrl("");
      router.refresh();
    }
    return r;
  }, null as { ok?: boolean; error?: string } | null);

  const payload = JSON.stringify({ mode, units });

  const updateUnit = (idx: number, patch: Partial<CourseUnit>) => {
    setUnits(prev => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };

  const handleFile = async (file: File | undefined, cb: (dataUrl: string) => void, maxMb = 4) => {
    if (!file) return;
    setErr("");
    if (file.size > maxMb * 1024 * 1024) {
      setErr(`File "${file.name}" is larger than ${maxMb} MB. Please pick a smaller file so it fits directly in Neon DB.`);
      return;
    }
    setBusy(true);
    try {
      const data = await fileToDataUrl(file);
      cb(data);
    } catch {
      setErr("Could not read file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-3xl border border-slate-200 bg-white p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-teal-950">Create Interactive Textbook / Audio Course (Neon DB Storage)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Add lessons with text, images and audio tracks stored directly in Neon PostgreSQL — no external storage required. Students read &amp; listen inside the site (no download).
        </p>
      </div>

      {/* Hidden serialized course payload stored in fileUrl column */}
      <input type="hidden" name="fileUrl" value={payload} />
      <input type="hidden" name="coverUrl" value={coverUrl} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-slate-600 sm:col-span-2">
          Course / Textbook Title
          <input name="title" required maxLength={140} placeholder="e.g. Daily English Conversation Vol. 1" className={input} />
        </label>

        <label className="text-xs font-bold text-slate-600">
          Type
          <select name="kind" defaultValue="textbook" className={input}>
            <option value="textbook">Textbook + Audio</option>
            <option value="audio">Audio Course</option>
            <option value="worksheet">Interactive Worksheet</option>
          </select>
        </label>

        <label className="text-xs font-bold text-slate-600">
          Study Mode
          <select value={mode} onChange={e => setMode(e.target.value as "both" | "self" | "tutor")} className={input}>
            <option value="both">Self-Study + Teach with Tutor</option>
            <option value="self">Self-Study Only</option>
            <option value="tutor">Teach with Tutor Only</option>
          </select>
        </label>

        <label className="text-xs font-bold text-slate-600">
          Language
          <select name="language" defaultValue="en" className={input}>
            <option value="en">English</option>
            <option value="zh">Chinese Support</option>
            <option value="ja">Japanese Support</option>
          </select>
        </label>

        <label className="text-xs font-bold text-slate-600">
          Level
          <select name="level" defaultValue="B1" className={input}>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>

        <label className="text-xs font-bold text-slate-600">
          Price (USD, 0 = Free)
          <input name="price" type="number" step="0.5" min="0" defaultValue="0" className={input} />
        </label>

        <div className="text-xs font-bold text-slate-600">
          Cover Image (Upload from computer)
          <input
            type="file"
            accept="image/*"
            onChange={e => handleFile(e.target.files?.[0], setCoverUrl, 2)}
            className="mt-1.5 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-teal-800"
          />
        </div>
      </div>

      <label className="block text-xs font-bold text-slate-600">
        Short Summary
        <textarea name="description" rows={2} maxLength={500} placeholder="What will students learn in this textbook?" className={input} />
      </label>

      {/* Lessons Builder */}
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-teal-950">Course Lessons ({units.length})</h3>
          <button
            type="button"
            onClick={() => setUnits(prev => [...prev, { title: `Lesson ${prev.length + 1}`, content: "", audioUrl: "", imageUrl: "" }])}
            className="rounded-xl bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"
          >
            + Add Another Lesson
          </button>
        </div>

        {units.map((u, idx) => (
          <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-teal-800">Lesson #{idx + 1}</span>
              {units.length > 1 && (
                <button
                  type="button"
                  onClick={() => setUnits(prev => prev.filter((_, i) => i !== idx))}
                  className="text-xs font-bold text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                Lesson Title
                <input
                  value={u.title}
                  onChange={e => updateUnit(idx, { title: e.target.value })}
                  required
                  className={input}
                />
              </label>

              <div className="text-xs font-bold text-slate-600">
                🎧 Lesson Audio Track (MP3/WAV from computer — auto-plays on start)
                <input
                  type="file"
                  accept="audio/*"
                  onChange={e => handleFile(e.target.files?.[0], url => updateUnit(idx, { audioUrl: url }), 4)}
                  className="mt-1.5 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-teal-800 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
                />
                {u.audioUrl && <span className="mt-1 inline-block text-[11px] font-semibold text-emerald-700">✓ Audio attached</span>}
              </div>

              <div className="text-xs font-bold text-slate-600">
                🖼 Lesson Page / Diagram Image (Optional, from computer)
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleFile(e.target.files?.[0], url => updateUnit(idx, { imageUrl: url }), 2)}
                  className="mt-1.5 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-700"
                />
                {u.imageUrl && <span className="mt-1 inline-block text-[11px] font-semibold text-emerald-700">✓ Image attached</span>}
              </div>

              <label className="text-xs font-bold text-slate-600 sm:col-span-2">
                Lesson Reading Text / Dialogue / Vocabulary
                <textarea
                  value={u.content}
                  onChange={e => updateUnit(idx, { content: e.target.value })}
                  rows={5}
                  placeholder="Write the dialogue, reading passage, vocabulary list, and questions for this lesson..."
                  className={input}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <input type="checkbox" name="published" defaultChecked className="accent-teal-700" />
        Publish immediately (visible in Student &amp; Tutor dashboards)
      </label>

      {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">{err}</p>}
      {state?.error && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">Could not save course: {state.error}</p>}
      {state?.ok && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">✓ Course saved in Neon DB!</p>}

      <button
        disabled={pending || busy}
        className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50"
      >
        {pending ? "Saving to Neon…" : busy ? "Processing file…" : "Save Textbook / Course"}
      </button>
    </form>
  );
}
