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
const cellKey = (wd: number, h: number) => `${wd}-${h}`;

function rangesToSet(ranges: InitialSlot[]): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) for (let m = r.startMinute; m + 30 <= r.endMinute; m += 30) set.add(cellKey(r.weekday, Math.floor(m / 30)));
  return set;
}
/** Teacher-local booked cells for the next 14 days, to paint over the grid. */
function bookedToSet(booked: BookedItem[], tzOffset: number): Set<string> {
  const set = new Set<string>();
  for (const b of booked) {
    const s = b.startAt.getTime(), e = s + b.duration * 60_000;
    for (let t = s; t < e; t += 30 * 60_000) {
      const local = new Date(t + tzOffset * 3600_000);
      set.add(cellKey(local.getUTCDay(), local.getUTCHours() * 2 + (local.getUTCMinutes() >= 30 ? 1 : 0)));
    }
  }
  return set;
}

export default function TimetableManager({ teacherId, tzOffset, initialSlots, blocked, booked, t, lang, viewerLabel, okMsg, errMsg }: {
  teacherId: number; tzOffset: number; initialSlots: InitialSlot[];
  blocked: BlockedItem[]; booked: BookedItem[];
  t: T; lang: Lang; viewerLabel: string; okMsg?: string; errMsg?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => rangesToSet(initialSlots));
  const [saving, setSaving] = useState(false);
  const paint = useRef<{ down: boolean; value: boolean }>({ down: false, value: true });
  const bookedSet = useMemo(() => bookedToSet(booked, tzOffset), [booked, tzOffset]);
  const days = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun display order
  const sign = tzOffset >= 0 ? "+" : "";

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
    // Compress to merged ranges for the server.
    const perDay = new Map<number, number[]>();
    for (const key of selected) {
      const [w, h] = key.split("-").map(Number);
      if (!perDay.has(w)) perDay.set(w, []);
      perDay.get(w)!.push(h);
    }
    const ranges: InitialSlot[] = [];
    for (const [wd, halves] of perDay) {
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

  const today = new Date().toISOString().slice(0, 10);

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

        <form action={saveWeeklyTimetable as unknown as (fd: FormData) => Promise<void>} onSubmit={() => setSaving(true)} onMouseUp={() => { paint.current.down = false; }} onMouseLeave={() => { paint.current.down = false; }}>
          <input type="hidden" name="slots" value={slotsJson} />
          <input type="hidden" name="tzOffset" value={tzOffset} />
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
            <div className="grid min-w-[640px]" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
              <div className="bg-slate-50 p-2" />
              {days.map(wd => (
                <div key={wd} className="border-l border-slate-100 bg-slate-50 p-2 text-center">
                  <div className="text-xs font-bold text-teal-950">{weekdayName(wd, lang)}</div>
                  <div className="mt-1 flex justify-center gap-1">
                    <button type="button" title={t.allDay} onClick={() => setDay(wd, Array.from({ length: HALVES }, (_, i) => i))} className="rounded bg-white px-1.5 text-[10px] font-bold text-teal-700 ring-1 ring-slate-200">{t.allDay}</button>
                    <button type="button" title={t.clearDay} onClick={() => setDay(wd, [])} className="rounded bg-white px-1.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200">{t.clearDay}</button>
                  </div>
                </div>
              ))}
              {Array.from({ length: 24 }, (_, hour) => [0, 1].map(half => {
                const h = hour * 2 + half;
                return (
                  <div key={`row-${h}`} className="contents">
                    <div className={`flex items-center justify-end pr-2 text-[10px] text-slate-400 ${half === 0 ? "border-t border-slate-100 font-bold" : ""}`}>
                      {half === 0 ? `${String(hour).padStart(2, "0")}:00` : ""}
                    </div>
                    {days.map(wd => {
                      const key = cellKey(wd, h);
                      const isBooked = bookedSet.has(key);
                      const on = selected.has(key);
                      return (
                        <button
                          key={key} type="button"
                          disabled={isBooked}
                          title={`${weekdayName(wd, lang, "long")} ${formatMinutes(h * 30)}`}
                          onMouseDown={e => { e.preventDefault(); paint.current = { down: true, value: !selected.has(key) }; toggleCell(wd, h, paint.current.value); }}
                          onMouseEnter={() => { if (paint.current.down) toggleCell(wd, h, paint.current.value); }}
                          className={`h-5 border-l border-slate-100 transition ${half === 0 ? "border-t border-slate-200/70" : ""} ${isBooked ? "cursor-not-allowed bg-amber-300" : on ? "bg-teal-600 hover:bg-teal-500" : "bg-white hover:bg-teal-50"}`}
                        />
                      );
                    })}
                  </div>
                );
              }))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-teal-600" />{t.legendOpen}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-white ring-1 ring-slate-300" />{t.legendClosed}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded bg-amber-300" />{t.legendBooked}</span>
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
                  <div className="font-semibold text-slate-700">{new Date(b.startAt.getTime() + tzOffset * 3600_000).toISOString().slice(0, 10)} · {new Date(b.startAt.getTime() + tzOffset * 3600_000).toISOString().slice(11, 16)}–{new Date(b.endAt.getTime() + tzOffset * 3600_000).toISOString().slice(11, 16)}</div>
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
            {booked.map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm">
                <Icon name="calendar" width={16} height={16} className="shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-700">{b.studentName}</div>
                  <div className="text-xs text-slate-500">{new Date(b.startAt.getTime() + tzOffset * 3600_000).toISOString().slice(0, 10)} {new Date(b.startAt.getTime() + tzOffset * 3600_000).toISOString().slice(11, 16)} · {b.duration}min · {b.status}</div>
                </div>
              </div>
            ))}
            {!booked.length && <p className="text-sm text-slate-400">{t.noUpcomingBookings}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
