import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, inArray, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonPackages, lessonParticipants, lessons, reviews, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, users } from "@/db/schema";
import { getT } from "@/lib/i18n";
import { LEARNING } from "@/lib/learning-i18n";
import { getUser } from "@/lib/auth";
import { teacherQuery } from "@/lib/queries";
import { buildSlots, formatMinutes, nowMs, tzFor, weekdayName, zonedParts, fmt } from "@/lib/time";
import { sendMessage } from "@/lib/actions";
import { FLAGS } from "@/components/TeacherCard";
import BookingPanel from "@/components/BookingPanel";
import Icon from "@/components/Icon";
import { money } from "@/lib/package-pricing";
import { ensureSeed } from "@/lib/seed";
export const dynamic = "force-dynamic";
export default async function TeacherPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; package?: string; duration?: string }>;
}) {
  await ensureSeed();
  const tid = Number((await params).id);
  if (!Number.isInteger(tid) || tid < 1) notFound();
  const sp = await searchParams;
  const { t, lang } = await getT();
  const c = LEARNING[lang];
  const [tr] = await teacherQuery().where(and(eq(users.role, "teacher"), eq(teacherProfiles.userId, tid), eq(teacherProfiles.active, true), or(eq(users.suspended, false), lte(users.suspendedUntil, new Date()))));
  if (!tr) notFound();
  const user = await getUser();
  const [booked, revs, prev, credits, weeklySlots, blockedSlots] = await Promise.all([
    db.select({ s: lessons.startAt, duration: lessons.duration }).from(lessons).where(and(
      user ? or(eq(lessons.teacherId, tid), eq(lessons.studentId, user.id)) : eq(lessons.teacherId, tid),
      ne(lessons.status, "cancelled"), gt(lessons.startAt, new Date(nowMs() - 3600_000)),
    )),
    db.select({ rating: reviews.rating, comment: reviews.comment, name: users.name, avatar: users.avatar }).from(reviews)
      .innerJoin(users, eq(users.id, reviews.studentId)).where(eq(reviews.teacherId, tid)).orderBy(desc(reviews.createdAt)).limit(10),
    user ? db.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.studentId, user.id), eq(lessons.teacherId, tid), ne(lessons.status, "cancelled"))).limit(1) : Promise.resolve([]),
    user?.role === "student" ? db.select({ id: lessonPackages.id, duration: lessonPackages.duration, remainingLessons: lessonPackages.remainingLessons, unitPrice: lessonPackages.unitPrice }).from(lessonPackages)
      .where(and(eq(lessonPackages.studentId, user.id), eq(lessonPackages.teacherId, tid), gt(lessonPackages.remainingLessons, 0))) : Promise.resolve([]),
    db.select({ weekday: teacherWeeklySlots.weekday, startMinute: teacherWeeklySlots.startMinute, endMinute: teacherWeeklySlots.endMinute }).from(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, tid)),
    db.select({ s: teacherBlockedSlots.startAt, e: teacherBlockedSlots.endAt }).from(teacherBlockedSlots).where(and(eq(teacherBlockedSlots.teacherId, tid), gt(teacherBlockedSlots.endAt, new Date()))),
  ]);
  const groupLessons = await db.select({ id: lessons.id, studentId: lessons.studentId, startAt: lessons.startAt, duration: lessons.duration, capacity: lessons.capacity })
    .from(lessons).where(and(eq(lessons.teacherId, tid), eq(lessons.classType, "semi_private"), inArray(lessons.status, ["pending", "confirmed"]), gt(lessons.startAt, new Date()), gt(lessons.startAt, new Date(nowMs() - 1000))));
  const groupIds = groupLessons.map(g => g.id);
  const groupMembers = groupIds.length ? await db.select({ lessonId: lessonParticipants.lessonId, studentId: lessonParticipants.studentId })
    .from(lessonParticipants).where(and(inArray(lessonParticipants.lessonId, groupIds), inArray(lessonParticipants.status, ["booked", "attended"]))) : [];
  const groupSlots = groupLessons.map(g => ({ id: g.id, iso: g.startAt.toISOString(), duration: g.duration,
    participantCount: Math.max(1, groupMembers.filter(m => m.lessonId === g.id).length), capacity: g.capacity }))
    .filter(g => g.participantCount < g.capacity);
  const taken = new Set<number>();
  for (const b of booked) { taken.add(b.s.getTime()); if (b.duration > 30) taken.add(b.s.getTime() + 30 * 60_000); }
  const avail = { ...tr, weeklySlots: weeklySlots.length ? weeklySlots : null, blocked: blockedSlots.map(x => ({ start: x.s.getTime(), end: x.e.getTime() })) };
  const days = buildSlots(lang, avail, taken, 50);
  const days25 = buildSlots(lang, avail, taken, 25);
  const mergeGroupSlots = (base: typeof days, duration: number) => {
    const map = new Map(base.map(d => [d.key, { ...d, slots: [...d.slots] }]));
    const zone = tr.timeZone || "UTC";
    for (const g of groupSlots.filter(x => x.duration === duration)) {
      const start = new Date(g.iso);
      const parts = zonedParts(start, zone);
      const key = `${parts.year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}`;
      if (!map.has(key)) map.set(key, { key, label: fmt(start, lang, { weekday: "short", month: "numeric", day: "numeric" }, zone), slots: [] });
      const day = map.get(key)!;
      if (!day.slots.some(s => s.iso === g.iso)) day.slots.push({ iso: g.iso, label: fmt(start, lang, { hour: "2-digit", minute: "2-digit", hour12: false }, zone) });
    }
    return [...map.values()].map(d => ({ ...d, slots: d.slots.sort((a,b) => a.iso.localeCompare(b.iso)) })).sort((a,b) => a.key.localeCompare(b.key)).slice(0,14);
  };
  const semiPrivateDays = mergeGroupSlots(days, 50);
  const semiPrivateDays25 = mergeGroupSlots(days25, 25);
  const legacyDays = new Set(tr.workDays.split(",").map(Number));
  const weeklySummary = [1, 2, 3, 4, 5, 6, 0].map(wd => ({
    wd, label: weekdayName(wd, lang),
    ranges: weeklySlots.length
      ? weeklySlots.filter(r => r.weekday === wd).sort((a, b) => a.startMinute - b.startMinute)
      : legacyDays.has(wd) ? [{ weekday: wd, startMinute: tr.startHour * 60, endMinute: tr.endHour * 60 }] : [],
  }));
  const tz = tzFor(lang, tr.timeZone);
  const errKey = sp.err ? `err_${sp.err}` as keyof typeof t : null;
  const error = sp.err === "credit" || sp.err === "trial" ? c.planError : errKey ? t[errKey] || t.err_generic : "";
  return <div className="mx-auto grid max-w-7xl items-start gap-7 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px]">
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-[26px] border border-slate-200 bg-white p-7 sm:flex-row"><img src={tr.avatar || ""} alt={tr.name} width={144} height={144} className="h-36 w-36 rounded-3xl object-cover"/><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold tracking-tight text-teal-950">{tr.name}</h1><span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{FLAGS[tr.country]}</span>{tr.certified&&<span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-600">Identity verified</span>}{tr.credentialVerified&&<span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700">Teaching credentials verified</span>}</div><p className="mt-2 text-sm leading-6 text-slate-500">{tr.headline}</p><div className="mt-3 flex flex-wrap gap-4 text-xs"><span className="font-bold text-amber-600">★ {tr.rating.toFixed(2)}</span><span className="text-slate-400">{tr.reviewsCount} {t.reviews}</span><span className="text-slate-400">{tr.lessonsCount} {t.lessons}</span><span className="text-slate-400">{tr.accent}</span></div><p className="mt-3 text-xs text-slate-500">{t.speaks}: <b>{tr.speaks}</b></p><div className="mt-3 flex flex-wrap gap-1.5">{tr.tags.split(",").filter(Boolean).map(g=><span key={g} className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-semibold text-teal-700">{g}</span>)}</div></div></div>
      <div className="rounded-[26px] border border-slate-200 bg-white p-7"><h2 className="text-xl font-bold text-teal-950">{t.about}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{tr.bio}</p></div>
      <div className="rounded-[26px] border border-slate-200 bg-white p-7"><h2 className="text-xl font-bold text-teal-950">{t.schedule}</h2><p className="mt-1 text-xs text-slate-400">{t.yourTz} {tz.label}</p><div className="mt-4 rounded-2xl border border-slate-100 p-4"><h3 className="text-sm font-bold text-teal-950">{t.weeklySummary} <span className="ml-1 font-normal text-slate-400">({t.tutorTz}: {tr.timeZone})</span></h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{weeklySummary.map(d => <div key={d.wd} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><span className="font-bold text-slate-600">{d.label}</span>{d.ranges.length ? <span className="text-right font-semibold text-teal-700">{d.ranges.map(r => `${formatMinutes(r.startMinute)}–${formatMinutes(r.endMinute)}`).join(" · ")}</span> : <span className="text-slate-400">{t.closedDay}</span>}</div>)}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{days.slice(0,6).map(d=><div key={d.key} className="rounded-2xl bg-slate-50 p-3"><div className="mb-2 text-sm font-bold text-slate-600">{d.label}</div><div className="flex flex-wrap gap-1">{d.slots.slice(0,8).map(s=><span key={s.iso} className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-teal-700 ring-1 ring-teal-100">{s.label}</span>)}{d.slots.length>8&&<span className="text-xs text-slate-400">+{d.slots.length-8}</span>}</div></div>)}</div>{!days.length&&<p className="mt-3 text-slate-400">{t.noSlots}</p>}</div>
      <div className="rounded-[26px] border border-slate-200 bg-white p-7"><h2 className="text-xl font-bold text-teal-950">★ {tr.rating.toFixed(1)} · {tr.reviewsCount} {t.reviews}</h2><div className="mt-4 divide-y divide-slate-100">{revs.map((r,i)=><div key={i} className="flex gap-3 py-4"><img src={r.avatar || ""} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 rounded-full bg-slate-100 object-cover"/><div><div className="text-sm font-semibold text-slate-700">{r.name} <span className="text-amber-500">{"★".repeat(r.rating)}</span></div><p className="mt-1 text-sm text-slate-500">{r.comment}</p></div></div>)}</div></div>
    </div>
    <aside className="space-y-4 lg:sticky lg:top-24">
      <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-100/60"><div className="flex items-baseline justify-between gap-2"><div><span className="text-3xl font-bold tracking-tight text-teal-950">{money(tr.price)}</span><span className="ml-1 text-xs text-slate-400">/ 50 {c.minutes}</span></div></div>{error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error} {sp.err==="balance"&&<Link href="/dashboard?tab=wallet" className="underline">{t.topUp}</Link>}</p>}
        {user?.role === "student" ? <BookingPanel teacherId={tr.id} days={days} days25={days25} semiPrivateDays={semiPrivateDays} semiPrivateDays25={semiPrivateDays25} groupSlots={groupSlots} price={tr.price} trialEligible={!prev.length} balance={user.balance} t={t} c={c} credits={credits} tzLabel={tz.label} initialPackageId={Number(sp.package)||undefined} initialDuration={sp.duration==="25"?25:50}/> : !user ? <Link href="/login" className="mt-5 block rounded-xl bg-teal-800 py-3 text-center text-sm font-bold text-white">{t.loginToBook}</Link> : <p className="mt-4 text-xs leading-5 text-slate-500">{t.studentsOnly}</p>}
        <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500"><li className="font-bold text-teal-900">{t.policyTitle}</li><li>{t.policy1}</li><li>{t.policy2}</li>{credits.length>0&&<li>{c.creditRestored}</li>}</ul>
      </div>
      <Link href={user?.role==="student"?`/dashboard?tab=packages&teacher=${tid}`:"/login"} className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-5 text-teal-800"><Icon name="box" className="shrink-0"/><div className="min-w-0 flex-1"><b className="text-sm">{c.packages}</b><p className="mt-0.5 text-[11px]">5% · 10% · 15% {c.off}</p></div><Icon name="chevron" width={17} height={17}/></Link>
      {user&&user.id!==tr.id&&<form action={sendMessage as unknown as (fd: FormData) => Promise<void>} className="rounded-[26px] border border-slate-200 bg-white p-6"><input type="hidden" name="to" value={tr.id}/><textarea name="body" required maxLength={2000} rows={3} placeholder={t.messagePlaceholder} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-500"/><button className="mt-2 w-full rounded-xl bg-teal-950 py-2.5 text-sm font-semibold text-white">{t.sendMessage}</button></form>}
    </aside>
  </div>;
}
