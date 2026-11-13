"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { groupStudentSlots, SCHEDULE_COPY } from "@/lib/student-schedule";
import { useStudentTime } from "./useStudentTime";
import Icon from "./Icon";

export default function StudentAvailability({ instants, profileZone, lang, serverNowMs }: {
  instants: string[]; profileZone?: string | null; lang: Lang; serverNowMs: number;
}) {
  const { zone, now } = useStudentTime(profileZone, lang, serverNowMs);
  const days = useMemo(() => groupStudentSlots(instants, lang, zone, now), [instants, lang, zone, now]);
  const [expanded, setExpanded] = useState(false);
  const copy = SCHEDULE_COPY[lang];
  return <section aria-labelledby="available-times-title" className="rounded-[26px] border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-bold tracking-[.15em] text-teal-700">{copy.next}</p><h2 id="available-times-title" className="mt-2 text-xl font-bold text-teal-950">{copy.availability}</h2></div>
      <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800"><Icon name="clock" width={14} height={14} />{zone.replaceAll("_", " ")}</span>
    </div>
    <p className="mt-3 text-xs leading-6 text-slate-500">{copy.note} <span className="whitespace-nowrap">50 {copy.minutes}.</span></p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {(expanded ? days : days.slice(0, 6)).map(day => <details key={day.key} className="group rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs"><span className="font-bold text-teal-950">{day.label}</span><span className="text-slate-500">{day.slots.length} {copy.slots} <span className="ml-1">⌄</span></span></summary>
        <div className="mt-3 flex flex-wrap gap-1.5">{day.slots.map(slot => <span key={slot.iso} className="rounded-lg border border-teal-100 bg-white px-2 py-1 text-xs font-semibold tabular-nums text-teal-800">{slot.label}{day.slots.filter(s => s.label === slot.label).length > 1 && <small> {slot.offset}</small>}</span>)}</div>
      </details>)}
    </div>
    {!days.length && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{copy.noSlots}</p>}
    {!expanded && days.length > 6 && <button type="button" onClick={() => setExpanded(true)} className="mt-4 text-xs font-semibold text-teal-700 underline underline-offset-4">{copy.more}</button>}
    <div className="mt-5 flex items-start gap-2 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500"><Icon name="calendar" width={15} height={15} className="mt-0.5 shrink-0" /><p>{copy.starts} · {copy.lead} <Link href="/dashboard?tab=profile" className="font-semibold text-teal-700 underline">{copy.change} {copy.zone.toLowerCase()}</Link></p></div>
  </section>;
}
