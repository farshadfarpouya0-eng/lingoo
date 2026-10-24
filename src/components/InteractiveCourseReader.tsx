"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";

export type CourseUnit = { title: string; content: string; audioUrl?: string; imageUrl?: string };

export type MaterialItem = {
  id: number;
  title: string;
  kind: string;
  language: string;
  level: string;
  description: string | null;
  price: number;
  isFree: boolean;
  published: boolean;
};

type Payload = { fileUrl: string; title: string; kind: string; description: string | null };

function parsePayload(fileUrl: string, title: string, kind: string, description: string | null): { units: CourseUnit[] } {
  try {
    if (fileUrl.trim().startsWith("{")) {
      const parsed = JSON.parse(fileUrl) as { units?: CourseUnit[] };
      return {
        units: Array.isArray(parsed.units) && parsed.units.length > 0
          ? parsed.units
          : [{ title: "Lesson 1", content: description || "" }],
      };
    }
  } catch {}
  const isAudio = kind === "audio" || fileUrl.startsWith("data:audio") || /\.(mp3|wav|ogg)$/i.test(fileUrl);
  return {
    units: [{
      title: "Lesson 1 · " + title,
      content: description || "Read the text and listen to the audio track.",
      audioUrl: isAudio ? fileUrl : "",
      imageUrl: !isAudio ? fileUrl : "",
    }],
  };
}

export default function InteractiveCourseReader({
  materials,
  ownedIds,
  isTutor,
  buyAction,
}: {
  materials: MaterialItem[];
  ownedIds: number[];
  isTutor: boolean;
  buyAction: (fd: FormData) => Promise<void>;
}) {
  const [studyMode, setStudyMode] = useState<"all" | "self" | "tutor">("all");
  const [activeBook, setActiveBook] = useState<MaterialItem | null>(null);
  const [units, setUnits] = useState<CourseUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unitIndex, setUnitIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const owned = new Set(ownedIds);

  const currentUnit = units[unitIndex] ?? null;

  async function openBook(m: MaterialItem) {
    setActiveBook(m);
    setUnits([]);
    setUnitIndex(0);
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`/api/materials/${m.id}/content`, { cache: "no-store" });
      if (r.status === 403) throw new Error("Unlock this course with your wallet to start studying.");
      if (!r.ok) throw new Error("Could not load this course. Please try again.");
      const data = (await r.json()) as Payload;
      const parsed = parsePayload(data.fileUrl, data.title, data.kind, data.description);
      setUnits(parsed.units);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this course.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentUnit?.audioUrl) { setIsPlaying(false); return; }
    audio.load();
    if (autoPlay) audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [activeBook?.id, unitIndex, currentUnit?.audioUrl, autoPlay]);

  if (activeBook) {
    return (
      <div className="select-none space-y-5" onContextMenu={e => e.preventDefault()}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setActiveBook(null); setUnits([]); }} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
              ← Back to Library
            </button>
            <div>
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-teal-800">{activeBook.level} · {activeBook.kind}</span>
              <h2 className="mt-0.5 text-lg font-black text-teal-950">{activeBook.title}</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={autoPlay} onChange={e => setAutoPlay(e.target.checked)} className="accent-teal-700" />
              Auto-play audio
            </label>
            {!isTutor && (
              <Link href={`/teachers?topic=${encodeURIComponent(activeBook.title)}`} className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-900">
                <Icon name="user" width={14} height={14} /> Learn this with a Tutor →
              </Link>
            )}
          </div>
        </div>

        {loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading course…</div>
        )}

        {!loading && error && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-sm font-bold text-amber-900">{error}</p>
            <button type="button" onClick={() => openBook(activeBook)} className="mt-4 rounded-xl bg-teal-800 px-5 py-2.5 text-xs font-bold text-white">Try again</button>
          </div>
        )}

        {!loading && !error && currentUnit && (
          <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Course Lessons ({units.length})</p>
              <div className="mt-3 space-y-1.5">
                {units.map((u, i) => (
                  <button key={i} type="button" onClick={() => setUnitIndex(i)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left text-xs font-bold transition ${i === unitIndex ? "bg-teal-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                    <span className="truncate">{i + 1}. {u.title}</span>
                    {u.audioUrl && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] ${i === unitIndex ? "bg-white/20 text-white" : "bg-teal-50 text-teal-700"}`}>🎧</span>}
                  </button>
                ))}
              </div>
            </aside>

            <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-teal-700">Lesson {unitIndex + 1} of {units.length}</p>
                    <h3 className="mt-1 text-2xl font-black text-teal-950">{currentUnit.title}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">🔒 In-site reader</span>
                </div>

                {currentUnit.audioUrl && (
                  <div className="mt-5 rounded-2xl bg-[#123e39] p-4 text-white">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-2 font-bold text-teal-200">
                        <span className={`h-2 w-2 rounded-full ${isPlaying ? "animate-ping bg-emerald-400" : "bg-teal-400"}`} />
                        🎧 Audio track
                      </span>
                      <button type="button" onClick={() => { const a = audioRef.current; if (!a) return; if (a.paused) { a.play(); setIsPlaying(true); } else { a.pause(); setIsPlaying(false); } }} className="rounded-lg bg-white/15 px-3 py-1 text-[11px] font-bold text-white hover:bg-white/25">
                        {isPlaying ? "Pause ⏸" : "Play ▶"}
                      </button>
                    </div>
                    <audio ref={audioRef} src={currentUnit.audioUrl} controls controlsList="nodownload noplaybackrate" onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} className="h-10 w-full" />
                  </div>
                )}

                {currentUnit.imageUrl && (
                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <img src={currentUnit.imageUrl} alt={currentUnit.title} draggable={false} className="pointer-events-none max-h-[420px] w-full object-contain" />
                  </div>
                )}

                <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50/70 p-6 text-base leading-8 text-slate-800">
                  {currentUnit.content || "Listen to the audio and repeat each sentence."}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
                <button type="button" disabled={unitIndex === 0} onClick={() => setUnitIndex(i => Math.max(0, i - 1))} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">← Previous</button>
                <span className="text-xs font-semibold text-slate-400">{unitIndex + 1} / {units.length}</span>
                <button type="button" disabled={unitIndex >= units.length - 1} onClick={() => setUnitIndex(i => Math.min(units.length - 1, i + 1))} className="rounded-xl bg-teal-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-900 disabled:opacity-40">Next →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">{isTutor ? "Tutor Teaching Resources" : "Interactive Learning Library"}</p>
          <h2 className="mt-1 text-2xl font-bold text-teal-950">Textbooks &amp; Audio Courses</h2>
          <p className="mt-1 text-sm text-slate-500">{isTutor ? "Open any textbook to teach it live inside the platform." : "Study on your own, or practice any lesson live with a tutor."}</p>
        </div>
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {([["all", "All"], ["self", "🎧 Self-Study"], ["tutor", "👨‍🏫 With Tutor"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setStudyMode(key)} className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${studyMode === key ? "bg-teal-800 text-white" : "text-slate-600 hover:text-teal-800"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {materials.map(m => {
          const canOpen = m.isFree || owned.has(m.id) || isTutor;
          return (
            <article key={m.id} className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold uppercase text-teal-800">{m.kind} · {m.level}</span>
                  <span className="text-xs font-bold text-teal-800">{m.isFree ? "FREE" : `$${(m.price / 100).toFixed(2)}`}</span>
                </div>
                <h3 className="mt-3 text-lg font-bold text-teal-950">{m.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{m.description || "Interactive textbook and audio course."}</p>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                {canOpen ? (
                  <>
                    <button type="button" onClick={() => openBook(m)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-900">
                      <Icon name="book" width={15} height={15} /> Start studying
                    </button>
                    {!isTutor && (
                      <Link href={`/teachers?topic=${encodeURIComponent(m.title)}`} className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/60 px-3.5 py-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100">👨‍🏫 Tutor</Link>
                    )}
                  </>
                ) : (
                  <form action={buyAction} className="w-full">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="w-full rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-bold text-teal-950 hover:bg-amber-400">Unlock · ${((m.price || 0) / 100).toFixed(2)}</button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!materials.length && <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-400">No courses published yet.</p>}
    </section>
  );
}
