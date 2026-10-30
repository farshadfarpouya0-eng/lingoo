"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import ClassroomChat from "@/components/ClassroomChat";
import ClassroomTeachingWorkspace from "@/components/ClassroomTeachingWorkspace";

type Props = {
  joinUrl: string;
  roomName: string;
  displayName: string;
  onNameChange: (v: string) => void;
  startLabel: string;
  minutesLeft: number | null;
  isTutor: boolean;
  lessonId: number;
  books: { id: number; title: string; category: string; level: string; fileUrl: string; description: string | null }[];
  userId: number;
};

const tool = "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition";

export default function LingoRoom({ joinUrl, roomName, displayName, onNameChange, startLabel, minutesLeft, isTutor, lessonId, books, userId }: Props) {
  const [joined, setJoined] = useState(false);
  const [tab, setTab] = useState<"plan" | "people" | "notes" | "tools" | "chat">("plan");
  const [notes, setNotes] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Keep pre-join lightweight: request camera/microphone only after the user
  // enters the live provider iframe, avoiding background permission prompts.
  useEffect(() => () => { /* provider iframe owns its media tracks */ }, []);

  const toggleFullscreen = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, []);

  /* ── pre-join ───────────────────────────────────── */
  if (!joined) {
    return (
      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Lingo Room · Private</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-teal-950">Ready to join?</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">{roomName}</span>
        </header>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="flex aspect-video flex-col items-center justify-center rounded-2xl bg-[#0f2a28] px-6 text-center text-white">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10"><Icon name="video" width={30} height={30} /></span>
            <p className="mt-4 text-sm font-bold">Your classroom is ready</p>
            <p className="mt-2 max-w-xs text-xs leading-5 text-white/65">Camera and microphone access is requested only when you enter the live classroom.</p>
          </div>

          {/* join form */}
          <div className="flex flex-col justify-center">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Display name</label>
            <input
              value={displayName}
              onChange={e => onNameChange(e.target.value)}
              maxLength={40}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500"
              placeholder="Your name"
            />

            <dl className="mt-5 space-y-2 text-xs text-slate-500">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <dt>Camera</dt>
                <dd className="font-semibold text-slate-500">Checked on entry</dd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <dt>Microphone</dt>
                <dd className="font-semibold text-slate-500">Checked on entry</dd>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <dt>Starts</dt>
                <dd className="font-semibold text-slate-700">{startLabel}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => {
                setJoined(true);
              }}
              className="mt-5 inline-flex items-center justify-center gap-3 rounded-xl bg-teal-800 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-teal-900"
            >
              Enter the classroom
              <Icon name="arrow" width={18} height={18} />
            </button>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">
              Nothing is recorded by default. Recording only starts after every participant agrees.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* ── live room ──────────────────────────────────── */
  return (
    <section ref={boxRef} className="overflow-hidden rounded-[26px] border border-slate-200 bg-[#0f2a28]">
      {/* top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1 text-[11px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
          </span>
          <b className="text-sm text-white">Lingo Room</b>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/70">{roomName}</span>
        </div>
        <div className="flex items-center gap-2">
          {minutesLeft !== null && (
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
              {minutesLeft > 0 ? `${minutesLeft} min left` : "Overtime"}
            </span>
          )}
          <button type="button" onClick={toggleFullscreen} className={`${tool} bg-white/10 text-white hover:bg-white/20`}>
            <Icon name="swap" width={15} height={15} /> Fullscreen
          </button>
          <button type="button" onClick={() => setJoined(false)} className={`${tool} bg-white/10 text-white hover:bg-white/20`}>
            <Icon name="close" width={15} height={15} /> Leave
          </button>
        </div>
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_290px]">
        {/* video */}
        <div className="overflow-hidden rounded-2xl bg-black">
          <iframe
            key={joinUrl}
            title="Lingo Room"
            src={joinUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="h-[68vh] min-h-[420px] w-full"
          />
        </div>

        {/* sidebar */}
        <aside className="flex min-h-[420px] flex-col rounded-2xl bg-white">
          <nav className="flex border-b border-slate-100">
            {(["plan", "people", "notes", "tools", "chat"] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`flex-1 border-b-2 px-3 py-3 text-xs font-semibold transition ${
                  tab === k ? "border-teal-700 text-teal-800" : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {k === "plan" ? "Lesson plan" : k === "people" ? "In the room" : k === "notes" ? "My notes" : k === "tools" ? "Teaching Tools" : "Class Chat"}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-auto p-4">
            {tab === "plan" && (
              <ol className="space-y-3">
                {[
                  ["01", "Warm-up", "Small talk + review of last time"],
                  ["02", "Target language", "New phrases for the lesson topic"],
                  ["03", "Practice", "Guided speaking, corrections live"],
                  ["04", "Free talk", "Student-led conversation"],
                  ["05", "Wrap-up", "Homework + tutor notes"],
                ].map(([n, title, text]) => (
                  <li key={n} className="flex gap-3 rounded-xl border border-slate-100 p-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-[10px] font-bold text-teal-700">{n}</span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{title}</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {tab === "people" && (
              <ul className="space-y-2">
                {[
                  [displayName, isTutor ? "Tutor" : "Student"],
                  [isTutor ? "Student" : "Tutor", isTutor ? "Student" : "Tutor"],
                ].map(([name, role], i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                      {String(name).slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{name}</p>
                      <p className="text-[10px] text-slate-400">{role}</p>
                    </div>
                    <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
                  </li>
                ))}
              </ul>
            )}

            {tab === "notes" && (
              <div>
                <p className="text-[11px] leading-5 text-slate-500">
                  Private notes — only you can see them.
                </p>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={12}
                  placeholder="New words, corrections, homework…"
                  className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-teal-500"
                />
              </div>
            )}

            {tab === "tools" && (
              <ClassroomTeachingWorkspace lessonId={lessonId} books={books} isTutor={isTutor} userId={userId} />
            )}

            {tab === "chat" && (
              <ClassroomChat lessonId={lessonId} userId={userId} />
            )}

          </div>


        </aside>
      </div>
    </section>
  );
}