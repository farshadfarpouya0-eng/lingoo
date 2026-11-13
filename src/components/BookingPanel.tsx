"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { bookLesson } from "@/lib/actions";
import type { LearningCopy } from "@/lib/learning-i18n";
import type { Lang } from "@/lib/i18n";
import { money, unitLessonPrice, type LessonDuration } from "@/lib/package-pricing";
import { groupStudentSlots, studentLessonRange, SCHEDULE_COPY } from "@/lib/student-schedule";
import { useStudentTime } from "./useStudentTime";
import Icon from "./Icon";

type GroupSlot = { id: number; iso: string; duration: number; participantCount: number; capacity: number };
export type BookingCredit = { id: number; duration: number; remainingLessons: number; unitPrice: number };
type Props = {
  teacherId: number; studentTimeZone?: string | null; serverNowMs: number; lang: Lang;
  slots50: string[]; slots25: string[]; groupSlots: GroupSlot[]; price: number;
  trialEligible: boolean; balance: number; t: Record<string, string>; c: LearningCopy;
  credits: BookingCredit[]; initialPackageId?: number; initialDuration?: LessonDuration;
};

export default function BookingPanel({ teacherId, studentTimeZone, serverNowMs, lang, slots50, slots25, groupSlots, price, trialEligible, balance, t, c, credits, initialPackageId, initialDuration }: Props) {
  const initialPack = credits.find(pack => pack.id === initialPackageId);
  const [duration, setDuration] = useState<LessonDuration>(initialPack?.duration === 25 ? 25 : initialPack?.duration === 50 ? 50 : initialDuration || 50);
  const [packageId, setPackageId] = useState(initialPack?.id || 0);
  const [classType, setClassType] = useState<"private" | "semi_private">("private");
  const [trial, setTrial] = useState(false);
  const [dayKey, setDayKey] = useState("");
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { zone, now } = useStudentTime(studentTimeZone, lang, serverNowMs);
  const copy = SCHEDULE_COPY[lang];
  const actualDuration = trial ? 25 : duration;
  const instants = useMemo(() => [
    ...(actualDuration === 25 ? slots25 : slots50),
    ...(classType === "semi_private" ? groupSlots.filter(s => s.duration === actualDuration && s.participantCount < s.capacity).map(s => s.iso) : []),
  ], [actualDuration, slots25, slots50, classType, groupSlots]);
  const days = useMemo(() => groupStudentSlots(instants, lang, zone, now), [instants, lang, zone, now]);
  const selectedDay = days.find(day => day.slots.some(slot => slot.iso === selected));
  const day = selectedDay || days.find(day => day.key === dayKey) || days[0];
  const slot = selectedDay ? selected : "";
  const pack = classType === "private" && !trial ? credits.find(p => p.id === packageId && p.duration === duration && p.remainingLessons > 0) : undefined;
  const groupSlot = classType === "semi_private" ? groupSlots.find(s => s.iso === slot && s.duration === actualDuration) : undefined;
  const amount = trial ? Math.round(unitLessonPrice(price, 25) / 2) : classType === "semi_private" ? Math.round(unitLessonPrice(price, duration) * .75) : pack?.unitPrice ?? unitLessonPrice(price, duration);
  const insufficient = !pack && balance < amount;
  const resetSelection = () => { setSelected(""); setDayKey(""); setError(""); };
  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-50";

  return <form action={bookLesson} onSubmit={event => {
    if (!slot || !days.some(d => d.slots.some(s => s.iso === slot))) { event.preventDefault(); setError(copy.timeGone); return; }
    setPending(true);
  }} className="mt-5 min-w-0 space-y-5" aria-label="Book a lesson">
    <input type="hidden" name="teacherId" value={teacherId} /><input type="hidden" name="startAt" value={slot} />
    <input type="hidden" name="duration" value={actualDuration} /><input type="hidden" name="trial" value={trial ? "1" : "0"} />
    <input type="hidden" name="classType" value={classType} /><input type="hidden" name="groupLessonId" value={groupSlot?.id || 0} />
    <input type="hidden" name="packageId" value={pack?.id || 0} />
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1.5">
      {(["private", "semi_private"] as const).map(type => <button type="button" key={type} aria-pressed={classType === type} onClick={() => { setClassType(type); setTrial(false); setPackageId(0); resetSelection(); }} className={`rounded-xl px-2 py-3 text-xs font-bold transition ${classType === type ? "bg-white text-teal-900 shadow-sm ring-1 ring-slate-100" : "text-slate-500 hover:text-teal-800"}`}>
        {type === "private" ? copy.private : copy.group}<span className="mt-1 block text-[10px] font-normal text-slate-500">{type === "private" ? copy.privateHint : copy.groupHint}</span>
      </button>)}
    </div>
    <fieldset><legend className="mb-2 text-xs font-semibold text-slate-600">{copy.duration}</legend><div className="grid grid-cols-2 gap-2">{([25, 50] as const).map(value => <button type="button" key={value} aria-pressed={!trial && duration === value} onClick={() => { setDuration(value); setTrial(false); setPackageId(0); resetSelection(); }} className={`rounded-xl border py-2.5 text-sm font-bold ${!trial && duration === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-500"}`}>{value} {copy.minutes}</button>)}</div></fieldset>
    {trialEligible && classType === "private" && <button type="button" aria-pressed={trial} onClick={() => { setTrial(!trial); setPackageId(0); resetSelection(); }} className={`flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left text-[11px] font-semibold ${trial ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"}`}><span>{copy.trial}</span><b>{money(Math.round(unitLessonPrice(price, 25) / 2))}</b></button>}
    {classType === "private" && !trial && credits.some(p => p.duration === duration && p.remainingLessons > 0) && <label className="block text-xs font-semibold text-slate-600">{c.useExisting}<select value={packageId} onChange={e => setPackageId(Number(e.target.value))} className={`${input} mt-2`}><option value={0}>{c.payWallet}</option>{credits.filter(p => p.duration === duration && p.remainingLessons > 0).map(p => <option key={p.id} value={p.id}>#{p.id} · {p.remainingLessons} {c.available}</option>)}</select></label>}

    <section className="min-w-0 space-y-3" aria-label={copy.select}>
      <h3 className="text-sm font-bold text-teal-950">{copy.select}</h3>
      <div className="flex items-start gap-2 rounded-xl bg-[#f0f6f2] p-3"><Icon name="clock" width={16} height={16} className="mt-0.5 shrink-0 text-teal-700" /><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-teal-900">{copy.zone} · <span data-testid="booking-zone">{zone.replaceAll("_", " ")}</span></p><p className="mt-1 text-[10px] leading-4 text-slate-500">{copy.note}</p></div><Link href="/dashboard?tab=profile" className="text-[10px] font-semibold text-teal-700 underline underline-offset-2">{copy.change}</Link></div>
      <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-2" role="group" aria-label="Available dates">
        {days.map(value => <button key={value.key} data-testid="booking-day" data-date={value.key} type="button" aria-pressed={day?.key === value.key} onClick={() => { setDayKey(value.key); setSelected(""); setError(""); }} className={`min-w-[100px] shrink-0 snap-start rounded-xl border px-3 py-3 text-center ${day?.key === value.key ? "border-teal-800 bg-teal-800 text-white" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-teal-300"}`}><b className="block text-xs">{value.shortLabel}</b><span className={`mt-1 block text-[10px] ${day?.key === value.key ? "text-teal-100" : "text-slate-400"}`}>{value.slots.length} {copy.slots}</span></button>)}
      </div>
      <div className="grid max-h-[240px] grid-cols-4 gap-2 overflow-y-auto pr-1" role="group" aria-label="Available start times">
        {day?.slots.map(value => <button type="button" key={value.iso} data-testid="booking-time" data-iso={value.iso} aria-pressed={slot === value.iso} onClick={() => { setSelected(value.iso); setError(""); }} className={`min-h-11 rounded-xl border px-1 py-2 text-sm font-semibold tabular-nums transition ${slot === value.iso ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-500 hover:bg-teal-50"}`}>{value.label}{day.slots.filter(s => s.label === value.label).length > 1 && <span className="block text-[9px]">{value.offset}</span>}</button>)}
      </div>
      {!days.length && <p className="rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-500">{copy.noSlots}</p>}
      <p className="text-[10px] leading-5 text-slate-400">{copy.lead}</p>
      {slot && <div data-testid="selected-lesson-time" aria-live="polite" className="rounded-xl border border-teal-100 bg-teal-50/60 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">{copy.selected}</p><p className="mt-1 text-xs font-bold leading-6 text-teal-950">{studentLessonRange(slot, actualDuration, zone, lang)}</p><p className="text-[10px] text-teal-700">{zone.replaceAll("_", " ")} · {actualDuration} {copy.minutes}</p></div>}
      {selected && !slot && <p role="alert" className="text-xs text-amber-800">{copy.timeGone}</p>}
      {slot && classType === "semi_private" && <p className="text-[11px] text-slate-500">{groupSlot ? `${groupSlot.participantCount}/${groupSlot.capacity} ${copy.seats}` : copy.newGroup}</p>}
    </section>
    <input name="topic" maxLength={200} placeholder={t.topic} aria-label={t.topic} className={input} />
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">{pack ? c.packageCredit : classType === "semi_private" ? copy.discount : copy.pay}</p><b className="text-lg text-teal-950">{pack ? `1 ${c.packageCredit}` : money(amount)}</b></div>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <button disabled={!slot || pending || insufficient} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-45">{pending ? "…" : pack ? c.useCredit : t.book}<Icon name="arrow" width={17} height={17} /></button>
    {insufficient && <p className="text-xs leading-5 text-amber-800">{c.balanceError} <Link href="/dashboard?tab=wallet" className="font-bold underline">{t.topUp}</Link></p>}
    <p className="flex items-start gap-2 text-[10px] leading-5 text-slate-400"><Icon name="shield" width={15} height={15} className="mt-0.5 shrink-0 text-teal-600" />{c.teacherDecides}</p>
  </form>;
}
