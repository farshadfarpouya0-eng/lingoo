"use client";
import { useMemo, useRef, useState } from "react";
import { addBlockedSlot, deleteBlockedSlot, saveWeeklyTimetable } from "@/lib/timetable-actions";
import { formatMinutes, weekdayName } from "@/lib/time";
import type { Lang, T } from "@/lib/i18n";
import Icon from "./Icon";

export type InitialSlot = { weekday: number; startMinute: number; endMinute: number };
export type BlockedItem = { id: number; startAt: Date; endAt: Date; reason: string };
export type BookedItem = { startAt: Date; duration: number; studentName: string; status: string };

const HALVES = 48;
const DAY = 86_400_000;
const MIN_WEEK = -3;
const MAX_WEEK = 5;
const cellKey = (wd: number, h: number) => `${wd}-${h}`;

type CellKind = "booked" | "completed" | "cancelled";
type CellInfo = { kind: CellKind; name: string; startsHere: boolean };

/** An active booking must never be hidden behind an old cancelled or finished lesson. */
const RANK: Record<CellKind, number> = { booked: 3, completed: 2, cancelled: 1 };

function rangesToSet(ranges: InitialSlot[]): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) for (let m = r.startMinute; m + 30 <= r.endMinute; m += 30) set.add(cellKey(r.weekday, Math.floor(m / 30)));
  return set;
}

/** UTC timestamp of Monday 00:00 in the tutor's local time, shifted by whole weeks. */
function weekStartUtc(tzOffset: number, weekOffset: number) {
  const local = new Date(Date.now() + tzOffset * 3600_000);
  const back = (local.getUTCDay() + 6) % 7;
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return midnight - back * DAY - tzOffset * 3600_000 + weekOffset * 7 * DAY;
}

/** Paint only the lessons that fall inside the selected week. */
function paintWeek(booked: BookedItem[], tzOffset: number, from: number, to: number) {
  const cells = new Map<string, CellInfo>();
  const perDay = new Map<number, number>();

  for (const b of booked) {
    const kind: CellKind = b.status === "completed" ? "completed" : b.status === "cancelled" ? "cancelled" : "booked";
    const s = b.startAt.getTime();
    const e = s + b.duration * 60_000;
    if (e <= from || s >= to) continue;

    let first = true;
    for (let t = s; t < e; t += 30 * 60_000) {
      if (t < from || t >= to) { first = false; continue; }
      const local = new Date(t + tzOffset * 3600_000);
      const key = cellKey(local.getUTCDay(), local.getUTCHours() * 2 + (local.getUTCMinutes() >= 30 ? 1 : 0));
      const prev = cells.get(key);
      if (!prev || RANK[kind] > RANK[prev.kind]) cells.set(key, { kind, name: b.studentName, startsHere: first });
      first = false;
    }

    if (kind !== "cancelled" && s >= from && s < to) {
      const wd = new Date(s + tzOffset * 3600_000).getUTCDay();
      perDay.set(wd, (perDay.get(wd) ?? 0) + 1);
    }
  }
  return { cells, perDay };
}

const localStamp = (d: Date, tzOffset: number) => new Date(d.getTime() + tzOffset * 3600_000).toISOString();

export default function TimetableManager({ teacherId, tzOffset, initialSlots, blocked, booked, t, lang, viewerLabel, okMsg, errMsg }: {
  teacherId: number; tzOffset: number; initialSlots: InitialSlot[];
  blocked: BlockedItem[]; booked: BookedItem[];
  t: T; lang: Lang; viewerLabel: string; okMsg?: string; errMsg?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => rangesToSet(initialSlots));
  const [saving, setSaving] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const paint = useRef<{ down: boolean; value: boolean }>({ down: false, value: true });

  const from = useMemo(() => weekStartUtc(tzOffset, weekOffset), [tzOffset, weekOffset]);
  const to = from + 7 * DAY;
  const { cells, perDay } = useMemo(() => paintWeek(booked, tzOffset, from, to), [booked, tzOffset, from, to]);
  const todayLocalDay = new Date(Date.now() + tzOffset * 3600_000).getUTCDay();

  const days = [1, 2, 3, 4, 5, 6, 0];
  const sign = tzOffset >= 0 ? "+" : "";

  const L = t as unknown as Record<string, string | undefined>;
  const label = (key: string, fallback: string) => L[key] || fallback;

  const dateFor = (wd: number) => new Date(from + ((wd + 6) % 7) * DAY + tzOffset * 3600_000);
  const rangeLabel = (() => {
    const a = dateFor(1), b = dateFor(0);
    return `${a.getUTCDate()}/${a.getUTCMonth() + 1} – ${b.getUTCDate()}/${b.getUTCMonth() + 1}`;
  })();

  const toggleCell = (wd: number, h: number, value?: boolean) => {
    const key = cellKey(wd, h);
    setSelected(prev => {
      const next = new Set(prev);
      const v = value ?? !next.has(key);
      if (v) next.add(key); else next.delete(key);
      return next;
    });
  };
  const setDay = (wd: number, halves: number[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      for (let h = 0; h < HALVES; h++) next.delete(cellKey(wd, h));
      for (const h of halves) next.add(cellKey(wd, h));
      return next;
    });
  };
  const preset = (halves: number[], onlyWeekdays: boolean) => {
    const next = new Set<string>();
    for (let wd = 0; wd <= 6; wd++) {
      if (onlyWeekdays && (wd === 0 || wd === 6)) continue;
      for (const h of halves) next.add(cellKey(wd, h));
    }
    setSelected(next);
  };
  const copyMonday = () => {
    const mon: number[] = [];
    for (let h = 0; h < HALVES; h++) if (selected.has(cellKey(1, h))) mon.push(h);
    const next = new Set<string>();
    for (let wd = 0; wd <= 6; wd++) for (const h of mon) next.add(cellKey(wd, h));
    setSelected(next);
  };
  const openCount = selected.size;

  const slotsJson = useMemo(() => {
    const perDayMap = new Map<number, number[]>();
    for (const key of selected) {
      const [w, h] = key.split("-").map(Number);
      if (!perDayMap.has(w)) perDayMap.set(w, []);
      perDayMap.get(w)!.push(h);
    }
    const ranges: InitialSlot[] = [];
    for (const [wd, halves] of perDayMap) {
      const sorted = [...new Set(halves)].sort((a, b) => a - b);
      let s: number | null = null, prev = -2;
      for (const h of sorted) {
        if (s === null) { s = h; prev = h; continue; }
        if (h === prev + 1) { prev = h; continue; }
        ranges.push({ weekday: wd, startMinute: s * 30, endMinute: (prev + 1) * 30 });
        s = h; prev = h;
      }
      if (s !== null) ranges.push({ weekday: wd, startMinute: s * 30, endMinute: (prev + 1) * 30 });
    }
    return JSON.stringify(ranges);
  }, [selected]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return booked.filter(b => ["pending", "confirmed"].includes(b.status) && b.startAt.getTime() + b.duration * 60_000 > now);
  }, [booked]);

  const today = new Date().toISOString().slice(0, 10);

  const legend: { color: string; ring?: boolean; text: string }[] = [
    { color: "bg-slate-400", text: label("legendCompleted", "Completed lesson") },
    { color: "bg-white", ring: true, text: label("legendClosed", "Timetable background") },
    { color: "bg-amber-300", text: label("legendBooked", "Booked") },
    { color: "bg-teal-600", text: label("legendOpen", "Available slot") },
    { color: "bg-red-400", text: label("legendCancelled", "Cancelled lesson") },
  ];

  const navBtn = "rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-teal-400 disabled:opacity-40";

  return (
    <div className="space-y-6">
      {okMsg && <p className="rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-700">{okMsg}</p>}
      {errMsg && <p className="rounded-2xl bg-red-50 p-4 font-semibold text-red-600">{errMsg}</p>}

      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-teal-950">{t.weeklyTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.timetableSub}</p>
            <p className="mt-1 text-xs text-slate-400">{t.tutorTz}: UTC{sign}{tzOffset} · {t.yourTz}: {viewerLabel}</p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">{openCount / 2}h / {t.openHours}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => preset(Array.from({ length: 18 }, (_, i) => 18 + i), true)} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:border-teal-400">{t.presetWeekdays}</button>
          <button type="button" onClick={() => preset(Array.from({ length: 10 }, (_, i) => 34 + i), false)} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:border-teal-400">{t.presetEvenings}</button>
          <button type="button" onClick={copyMonday} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-600 hover:border-teal-400">{t.copyMonday}</button>
          <button type="button" onClick={() => setSelected(new Set())} className="rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-400 hover:text-red-500">{t.clearAll}</button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <button type="button" disabled={weekOffset <= MIN_WEEK} onClick={() => setWeekOffset(w => w - 1)} className={navBtn}>← Previous week</button>
            <button type="button" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)} className={navBtn}>This week</button>
            <button type="button" disabled={weekOffset >= MAX_WEEK} onClick={() => setWeekOffset(w => w + 1)} className={navBtn}>Next week →</button>
          </div>
          <span className="text-xs font-bold text-teal-900">{rangeLabel}</span>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Green cells repeat every week. Lessons are shown for the selected week only.</p>

        <form action={saveWeeklyTimetable as unknown as (fd: FormData) => Promise<void>} onSubmit={() => setSaving(true)} onMouseUp={() => { paint.current.down = false; }} onMouseLeave={() => { paint.current.down = false; }}>
          <input type="hidden" name="slots" value={slotsJson} />
          <input type="hidden" name="tzOffset" value={tzOffset} />

          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-100">
            <div className="grid min-w-[760px]" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
              <div className="bg-slate-50 p-2" />

              {days.map(wd => {
                const count = perDay.get(wd) ?? 0;
                const isToday = weekOffset === 0 && wd === todayLocalDay;
                const d = dateFor(wd);
                return (
                  <div key={wd} className={`border-l border-slate-100 p-2 text-center ${isToday ? "bg-amber-50" : "bg-slate-50"}`}>
                    <div className="text-xs font-bold text-teal-950">{weekdayName(wd, lang)}</div>
                    <div className="text-[10px] text-slate-400">{d.getUTCDate()}/{d.getUTCMonth() + 1}</div>
                    <div className="mt-1 flex justify-center">
                      <span
                        title={`${count} ${count === 1 ? "lesson" : "lessons"}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          count === 0 ? "bg-slate-200/70 text-slate-400"
                            : isToday ? "animate-pulse bg-amber-400 text-white shadow-sm shadow-amber-300"
                              : "bg-teal-600 text-white"
                        }`}
                      >
                        {isToday && count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        {count} {count === 1 ? "class" : "classes"}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-center gap-1">
                      <button type="button" title={t.allDay} onClick={() => setDay(wd, Array.from({ length: HALVES }, (_, i) => i))} className="rounded bg-white px-1.5 text-[10px] font-bold text-teal-700 ring-1 ring-slate-200">{t.allDay}</button>
                      <button type="button" title={t.clearDay} onClick={() => setDay(wd, [])} className="rounded bg-white px-1.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200">{t.clearDay}</button>
                    </div>
                  </div>
                );
              })}

              {Array.from({ length: 24 }, (_, hour) => [0, 1].map(half => {
                const h = hour * 2 + half;
                return (
                  <div key={`row-${h}`} className="contents">
                    <div className={`flex items-center justify-end pr-2 text-[10px] text-slate-400 ${half === 0 ? "border-t border-slate-100 font-bold" : ""}`}>
                      {half === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
                    </div>
                    {days.map(wd => {
                      const key = cellKey(wd, h);
                      const info = cells.get(key);
                      const on = selected.has(key);
                      const cellClass = info
                        ? info.kind === "completed" ? "cursor-not-allowed bg-slate-400"
                          : info.kind === "cancelled" ? "cursor-not-allowed bg-red-400"
                            : "cursor-not-allowed bg-amber-300"
                        : on ? "bg-teal-600 hover:bg-teal-500" : "bg-white hover:bg-teal-50";
                      return (
                        <button
                          key={key} type="button" disabled={!!info}
                          title={info ? `${info.name} · ${info.kind}` : `${weekdayName(wd, lang, "long")} ${formatMinutes(h * 30)}`}
                          onMouseDown={e => { e.preventDefault(); paint.current = { down: true, value: !selected.has(key) }; toggleCell(wd, h, paint.current.value); }}
                          onMouseEnter={() => { if (paint.current.down) toggleCell(wd, h, paint.current.value); }}
                          className={`relative h-6 border-l border-slate-100 transition ${half === 0 ? "border-t border-slate-200/70" : ""} ${cellClass}`}
                        >
                          {info?.startsHere && (
                            <span className="pointer-events-none absolute left-1 top-0 z-20 whitespace-nowrap rounded bg-slate-900/85 px-1.5 text-[9px] font-semibold leading-6 text-white">
                              {info.name}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              }))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            {legend.map(item => (
              <span key={item.text} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded ${item.color} ${item.ring ? "ring-1 ring-slate-300" : ""}`} />
                {item.text}
              </span>
            ))}
          </div>

          <button disabled={saving} className="mt-4 w-full rounded-xl bg-teal-700 py-3 font-bold text-white hover:bg-teal-800 disabled:opacity-60">
            {saving ? "…" : t.saveTimetable}
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-teal-950">{t.blockedTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.blockedHint}</p>
          <form action={addBlockedSlot as unknown as (fd: FormData) => Promise<void>} className="mt-4 grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs font-semibold text-slate-500">{t.blockDate}<input name="date" type="date" required min={today} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-teal-500" /></label>
            <label className="text-xs font-semibold text-slate-500">{t.blockStart}<input name="start" type="time" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-teal-500" /></label>
            <label className="text-xs font-semibold text-slate-500">{t.blockEnd}<input name="end" type="time" required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-teal-500" /></label>
            <label className="col-span-2 text-xs font-semibold text-slate-500">{t.blockReason}<input name="reason" maxLength={120} placeholder={t.blockReasonPh} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-teal-500" /></label>
            <button className="col-span-2 rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-700">{t.addBlock}</button>
          </form>
          <div className="mt-4 space-y-2">
            {blocked.map(b => (
              <div key={b.id} className="flex items-center gap-3 rounded-xl bg-red-50/60 p-3 text-sm">
                <Icon name="close" width={14} height={14} className="shrink-0 text-red-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-700">{localStamp(b.startAt, tzOffset).slice(0, 10)} · {localStamp(b.startAt, tzOffset).slice(11, 16)}–{localStamp(b.endAt, tzOffset).slice(11, 16)}</div>
                  {b.reason && <div className="truncate text-xs text-slate-500">{b.reason}</div>}
                </div>
                <form action={deleteBlockedSlot as unknown as (fd: FormData) => Promise<void>}><input type="hidden" name="id" value={b.id} /><button className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50">{t.delete}</button></form>
              </div>
            ))}
            {!blocked.length && <p className="text-sm text-slate-400">{t.noBlocks}</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-teal-950">{t.upcomingBookings}</h2>
          <div className="mt-4 space-y-2">
            {upcoming.map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm">
                <Icon name="calendar" width={16} height={16} className="shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-700">{b.studentName}</div>
                  <div className="text-xs text-slate-500">{localStamp(b.startAt, tzOffset).slice(0, 10)} {localStamp(b.startAt, tzOffset).slice(11, 16)} · {b.duration}min · {b.status}</div>
                </div>
              </div>
            ))}
            {!upcoming.length && <p className="text-sm text-slate-400">{t.noUpcomingBookings}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
