"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";

export type CourseUnit = {
  title: string;
  content: string;
  audioUrl?: string;
  imageUrl?: string;
};

export type MaterialItem = {
  id: number;
  title: string;
  kind: string;
  language: string;
  level: string;
  description: string | null;
  coverUrl: string | null;
  fileUrl: string;
  price: number;
  isFree: boolean;
  published: boolean;
};

export function parseUnits(m: MaterialItem): { mode: "both" | "self" | "tutor"; units: CourseUnit[] } {
  try {
    if (m.fileUrl && m.fileUrl.trim().startsWith("{")) {
      const parsed = JSON.parse(m.fileUrl);
      return {
        mode: parsed.mode || "both",
        units: Array.isArray(parsed.units) && parsed.units.length > 0
          ? parsed.units
          : [{ title: "Lesson 1", content: m.description || "", audioUrl: "" }],
      };
    }
  } catch {}
  const isAudio = m.kind === "audio" || m.fileUrl.startsWith("data:audio") || /\.(mp3|wav|ogg)$/i.test(m.fileUrl);
  return {
    mode: "both",
    units: [
      {
        title: "Lesson 1 · " + m.title,
        content: m.description || "Read the text below carefully and listen to the pronunciation track.",
        audioUrl: isAudio ? m.fileUrl : "",
        imageUrl: !isAudio && m.fileUrl ? m.fileUrl : m.coverUrl || "",
      },
    ],
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
  const [unitIndex, setUnitIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const owned = new Set(ownedIds);

  const filtered = materials.filter(m => {
    if (studyMode === "all") return true;
    const { mode } = parseUnits(m);
    return mode === "both" || mode === studyMode;
  });

  const activeParsed = activeBook ? parseUnits(activeBook) : null;
  const currentUnit = activeParsed ? activeParsed.units[unitIndex] || activeParsed.units[0] : null;

  /* ⭐ Auto-play audio whenever a user opens a book or switches to Lesson 1, 2, ... */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentUnit?.audioUrl) return;
    audio.load();
    if (autoPlay) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [activeBook?.id, unitIndex, currentUnit?.audioUrl, autoPlay]);

  if (activeBook && activeParsed && currentUnit) {
    return (
      <div
        className="select-none space-y-5"
        onContextMenu={e => e.preventDefault()}
      >
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setActiveBook(null); setUnitIndex(0); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              ← Back to Library
            </button>
            <div>
              <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-teal-800">
                {activeBook.level} · {activeBook.kind}
              </span>
              <h2 className="mt-0.5 text-lg font-black text-teal-950">{activeBook.title}</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={e => setAutoPlay(e.target.checked)}
                className="accent-teal-700"
              />
              Auto-play audio on lesson start
            </label>

            {!isTutor && (
              <Link
                href={`/teachers?topic=${encodeURIComponent(activeBook.title + " - " + currentUnit.title)}`}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-teal-900"
              >
                <Icon name="user" width={14} height={14} />
                Learn this with a Tutor →
              </Link>
            )}
          </div>
        </div>

        {/* Main Interactive Study Platform */}
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Units / Lessons Sidebar */}
          <aside className="rounded-3xl border border-slate-200 bg-white p-4">
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Course Lessons ({activeParsed.units.length})
            </p>
            <div className="mt-3 space-y-1.5">
              {activeParsed.units.map((u, idx) => {
                const active = idx === unitIndex;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setUnitIndex(idx)}
                    className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-3 text-left text-xs font-bold transition ${
                      active ? "bg-teal-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{idx + 1}. {u.title}</span>
                    {u.audioUrl && (
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] ${active ? "bg-white/20 text-white" : "bg-teal-50 text-teal-700"}`}>
                        🎧 Audio
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {!isTutor && (
              <div className="mt-6 rounded-2xl bg-amber-50 p-3.5 text-xs text-amber-950">
                <p className="font-bold">Want live feedback?</p>
                <p className="mt-1 text-[11px] leading-5 text-amber-900/80">
                  Book a tutor to practice pronunciation and role-play this exact lesson live.
                </p>
                <Link
                  href={`/teachers?topic=${encodeURIComponent(activeBook.title)}`}
                  className="mt-2.5 inline-flex items-center gap-1 font-bold text-teal-800 underline"
                >
                  Choose a Tutor →
                </Link>
              </div>
            )}
          </aside>

          {/* Lesson Reader & Auto-Audio Stage */}
          <div className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-teal-700">
                    Lesson {unitIndex + 1} of {activeParsed.units.length}
                  </p>
                  <h3 className="mt-1 text-2xl font-black text-teal-950">{currentUnit.title}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">
                  🔒 Protected In-Site Reader (No Download)
                </span>
              </div>

              {/* Dedicated Auto-Play Audio Bar */}
              {currentUnit.audioUrl && (
                <div className="mt-5 rounded-2xl bg-[#123e39] p-4 text-white shadow-md">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 font-bold text-teal-200">
                      <span className={`h-2 w-2 rounded-full ${isPlaying ? "animate-ping bg-emerald-400" : "bg-teal-400"}`} />
                      🎧 Lesson Audio Track {isPlaying ? "(Playing automatically…)" : "(Ready)"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const a = audioRef.current;
                        if (!a) return;
                        if (a.paused) { a.play(); setIsPlaying(true); } else { a.pause(); setIsPlaying(false); }
                      }}
                      className="rounded-lg bg-white/15 px-3 py-1 text-[11px] font-bold text-white hover:bg-white/25"
                    >
                      {isPlaying ? "Pause ⏸" : "Play ▶"}
                    </button>
                  </div>
                  <audio
                    ref={audioRef}
                    src={currentUnit.audioUrl}
                    controls
                    controlsList="nodownload noplaybackrate"
                    onLoadStart={() => setIsPlaying(false)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    className="w-full h-10"
                  />
                </div>
              )}

              {/* Optional Lesson Illustration / Page Image */}
              {currentUnit.imageUrl && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <img
                    src={currentUnit.imageUrl}
                    alt={currentUnit.title}
                    draggable={false}
                    className="max-h-[420px] w-full object-contain pointer-events-none"
                  />
                </div>
              )}

              {/* Lesson Text Content */}
              <div className="mt-6 whitespace-pre-wrap rounded-2xl bg-slate-50/70 p-6 text-base leading-8 text-slate-800 border border-slate-100">
                {currentUnit.content || "Listen to the audio track and repeat each sentence aloud."}
              </div>
            </div>

            {/* Bottom Lesson Navigation */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                type="button"
                disabled={unitIndex === 0}
                onClick={() => setUnitIndex(i => Math.max(0, i - 1))}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Previous Lesson
              </button>
              <span className="text-xs font-semibold text-slate-400">
                Lesson {unitIndex + 1} / {activeParsed.units.length}
              </span>
              <button
                type="button"
                disabled={unitIndex >= activeParsed.units.length - 1}
                onClick={() => setUnitIndex(i => Math.min(activeParsed.units.length - 1, i + 1))}
                className="rounded-xl bg-teal-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-900 disabled:opacity-40"
              >
                Next Lesson (Auto-play) →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Library Catalog View (Student & Teacher Dashboard) ── */
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-teal-700">
            {isTutor ? "Tutor Teaching Resources" : "Interactive Learning Library"}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-teal-950">Textbooks &amp; Audio Courses</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isTutor
              ? "Open any textbook or audio course below to teach your students live inside the platform."
              : "Study on your own with automatic audio playback, or practice any textbook live with a tutor."}
          </p>
        </div>

        {/* Mode Switcher: Self-Study vs With a Tutor */}
        <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {([
            ["all", "All Courses"],
            ["self", "🎧 Self-Study"],
            ["tutor", "👨‍🏫 Teach with Tutor"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStudyMode(key)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                studyMode === key ? "bg-teal-800 text-white" : "text-slate-600 hover:text-teal-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {filtered.map(m => {
          const canOpen = m.isFree || owned.has(m.id) || isTutor;
          const parsed = parseUnits(m);
          const hasAudio = parsed.units.some(u => !!u.audioUrl);

          return (
            <article key={m.id} className="flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300">
              <div>
                {m.coverUrl && (
                  <img
                    src={m.coverUrl}
                    alt={m.title}
                    draggable={false}
                    className="mb-4 h-40 w-full rounded-2xl object-cover pointer-events-none"
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold uppercase text-teal-800">
                      {m.kind} · {m.level}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      {parsed.units.length} {parsed.units.length === 1 ? "Lesson" : "Lessons"}
                    </span>
                    {hasAudio && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                        🎧 Auto-Audio
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-teal-800">
                    {m.isFree ? "FREE" : `$${(m.price / 100).toFixed(2)}`}
                  </span>
                </div>

                <h3 className="mt-3 text-lg font-bold text-teal-950">{m.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {m.description || "Interactive textbook and audio course."}
                </p>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
                {canOpen ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setActiveBook(m); setUnitIndex(0); }}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-900"
                    >
                      <Icon name="book" width={15} height={15} />
                      {isTutor ? "Open for Teaching" : "Start Lesson 1 (Auto-Audio)"}
                    </button>
                    {!isTutor && (
                      <Link
                        href={`/teachers?topic=${encodeURIComponent(m.title)}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/60 px-3.5 py-2.5 text-xs font-bold text-teal-900 hover:bg-teal-100"
                      >
                        👨‍🏫 Study with Tutor
                      </Link>
                    )}
                  </>
                ) : (
                  <form action={buyAction} className="w-full">
                    <input type="hidden" name="id" value={m.id} />
                    <button className="w-full rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-bold text-teal-950 hover:bg-amber-400">
                      Unlock Course · ${((m.price || 0) / 100).toFixed(2)} (From Wallet)
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length && (
        <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-400">
          No courses match this filter yet.
        </p>
      )}
    </section>
  );
}
