"use client";
import { useState } from "react";
import { bookLesson } from "@/lib/actions";
import type { LearningCopy } from "@/lib/learning-i18n";
import { money, unitLessonPrice, type LessonDuration } from "@/lib/package-pricing";
import Icon from "./Icon";
type Day = { key: string; label: string; slots: { iso: string; label: string }[] };
type GroupSlot = { id: number; iso: string; duration: number; participantCount: number; capacity: number };
export type BookingCredit = { id: number; duration: number; remainingLessons: number; unitPrice: number };
export default function BookingPanel({ teacherId, days, days25, semiPrivateDays, semiPrivateDays25, groupSlots, price, trialEligible, balance, t, c, tzLabel, credits, initialPackageId, initialDuration }: {
  teacherId: number; days: Day[]; days25: Day[]; semiPrivateDays: Day[]; semiPrivateDays25: Day[]; groupSlots: GroupSlot[]; price: number; trialEligible: boolean; balance: number; t: Record<string,string>; c: LearningCopy; tzLabel: string;
  credits: BookingCredit[]; initialPackageId?: number; initialDuration?: LessonDuration;
}) {
  const initialPack=credits.find(p=>p.id===initialPackageId);
  const [duration,setDuration]=useState<LessonDuration>(initialPack?.duration===25?25:initialPack?.duration===50?50:initialDuration||50);
  const [packageId,setPackageId]=useState(initialPack?.id||0);
  const [dayKey,setDayKey]=useState("");
  const [slot,setSlot]=useState("");
  const [pending,setPending]=useState(false);
  const [trial,setTrial]=useState(false);
  const [classType,setClassType]=useState<"private"|"semi_private">("private");
  const chosenDays=classType==="semi_private" ? (duration===25?semiPrivateDays25:semiPrivateDays) : ((trial||duration===25)?days25:days);
  const day=chosenDays.find(d=>d.key===dayKey)||chosenDays[0];
  const pack=credits.find(p=>p.id===packageId&&p.duration===duration);
  const available=credits.filter(p=>p.duration===duration);
  const trialPrice=Math.round(unitLessonPrice(price,25)/2);
  const groupSlot=classType==="semi_private" ? groupSlots.find(g=>g.iso===slot&&g.duration===duration) : undefined;
  const amount=trial?trialPrice:classType==="semi_private"?Math.round(unitLessonPrice(price,duration)*0.75):pack?.unitPrice??unitLessonPrice(price,duration);
  return <form action={bookLesson} onSubmit={()=>setPending(true)} className="mt-5 space-y-4">
    <input type="hidden" name="teacherId" value={teacherId}/><input type="hidden" name="startAt" value={slot}/><input type="hidden" name="duration" value={trial?25:duration}/><input type="hidden" name="trial" value={trial?"1":"0"}/><input type="hidden" name="packageId" value={trial||classType==="semi_private"?0:pack?.id||0}/><input type="hidden" name="classType" value={classType}/><input type="hidden" name="groupLessonId" value={groupSlot?.id||0}/>
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" aria-pressed={classType==="private"} onClick={()=>{setClassType("private");setTrial(false);setPackageId(0);setSlot("");setDayKey("");}} className={`rounded-lg py-2.5 text-sm font-bold ${classType==="private"?"bg-white text-teal-800 shadow-sm":"text-slate-400"}`}>Private · 1 student</button><button type="button" aria-pressed={classType==="semi_private"} onClick={()=>{setClassType("semi_private");setTrial(false);setPackageId(0);setSlot("");setDayKey("");}} className={`rounded-lg py-2.5 text-sm font-bold ${classType==="semi_private"?"bg-white text-teal-800 shadow-sm":"text-slate-400"}`}>Semi-private · 2–4 students</button></div>
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">{([25,50] as const).map(d=><button key={d} type="button" aria-pressed={!trial&&duration===d} onClick={()=>{setDuration(d);setTrial(false);setPackageId(0);setSlot("");setDayKey("");}} className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${!trial&&duration===d?"bg-white text-teal-800 shadow-sm":"text-slate-400"}`}>{d} {c.minutes}</button>)}</div>
    {classType==="private"&&trialEligible&&<button type="button" aria-pressed={trial} onClick={()=>{setTrial(!trial);setPackageId(0);setSlot("");setDayKey("");}} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-semibold ${trial?"border-amber-400 bg-amber-50 text-amber-900":"border-slate-200 text-slate-500"}`}><span>{t.trial} · 25 {c.minutes} · 50% {c.off}</span><span>{money(trialPrice)}</span></button>}
    {classType==="private"&&!trial&&available.length>0&&<label className="block text-xs font-semibold text-slate-500">{c.useExisting}<select value={packageId} onChange={e=>setPackageId(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-teal-200 bg-teal-50/50 px-3 py-2.5 text-sm text-teal-800"><option value={0}>{c.payWallet}</option>{available.map(p=><option key={p.id} value={p.id}>#{p.id} · {p.remainingLessons} {c.available} · {money(p.unitPrice)}</option>)}</select></label>}
    <div><div className="mb-2 flex items-center justify-between text-sm"><b>{t.selectTime}</b><span className="text-[10px] text-slate-400">{tzLabel}</span></div><div className="flex gap-2 overflow-x-auto pb-2">{chosenDays.map(d=><button key={d.key} type="button" onClick={()=>{setDayKey(d.key);setSlot("");}} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${d.key===day?.key?"bg-teal-700 text-white":"bg-slate-100 text-slate-500"}`}>{d.label}</button>)}</div><div className="mt-2 grid max-h-44 grid-cols-4 gap-2 overflow-y-auto">{day?.slots.map(s=><button key={s.iso} type="button" onClick={()=>setSlot(s.iso)} className={`rounded-lg border py-2 text-sm font-semibold ${slot===s.iso?"border-teal-700 bg-teal-700 text-white":"border-slate-200 text-slate-600 hover:border-teal-400"}`}>{s.label}</button>)}</div>{!chosenDays.length&&<p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-400">{t.noSlots}</p>}{classType==="semi_private"&&groupSlot&&<p className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">Joining an existing group · {groupSlot.participantCount}/{groupSlot.capacity} seats already booked</p>}{classType==="semi_private"&&!groupSlot&&slot&&<p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">This will open a new semi-private class. Other students can join this time.</p>}</div>
    <input name="topic" maxLength={200} placeholder={t.topic} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"/>
    <div className="flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-400">{classType==="semi_private"?"25% semi-private seat discount":pack?c.packageCredit:c.payWallet}</p><b className="text-teal-900">{classType==="private"&&pack?`1 ${c.packageCredit}`:money(amount)}</b></div>
    <button disabled={!slot||pending||(classType==="private"&&!pack&&balance<amount)||(classType==="semi_private"&&balance<amount)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">{pending?"…":classType==="private"&&pack?c.useCredit:t.book}<Icon name="arrow" width={16} height={16}/></button>
    {((classType==="semi_private"||!pack)&&balance<amount)&&<p className="text-xs text-red-600">{c.balanceError}</p>}
    <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Icon name="video" width={15} height={15} className="mt-0.5 shrink-0 text-teal-700"/>{c.teacherDecides}</p>{classType==="semi_private"&&<p className="text-[11px] leading-5 text-slate-400">Semi-private bookings are wallet-funded. Trial offers and private-class packages cannot be used for group seats.</p>}
  </form>;
}
