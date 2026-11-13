import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, inArray, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonPackages, lessonParticipants, lessons, reviews, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, users } from "@/db/schema";
import { getT } from "@/lib/i18n";
import { LEARNING } from "@/lib/learning-i18n";
import { getUser } from "@/lib/auth";
import { teacherQuery } from "@/lib/queries";
import { buildSlots, isBookingLeadTimeOpen, nowMs } from "@/lib/time";
import { publicSlotInstants } from "@/lib/student-schedule";
import StudentAvailability from "@/components/StudentAvailability";
import { sendMessage } from "@/lib/actions";
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
  // All generation and validation use the private tutor zone on the server.
  // Students receive UTC instants only, never teacher-day labels or raw weekly hours.
  const avail = { ...tr, weeklySlots: weeklySlots.length ? weeklySlots : null,
    blocked: [
      ...blockedSlots.map(x => ({ start: x.s.getTime(), end: x.e.getTime() })),
      ...booked.map(x => ({ start: x.s.getTime(), end: x.s.getTime() + x.duration * 60_000 })),
    ],
  };
  const slots50 = publicSlotInstants(buildSlots(lang, avail, new Set<number>(), 50));
  const slots25 = publicSlotInstants(buildSlots(lang, avail, new Set<number>(), 25));
  const visibleGroupSlots = groupSlots.filter(g => isBookingLeadTimeOpen(g.iso));
  const viewerZone = user?.timeZone ?? null;
  const serverNowMs = Date.now();
  const errKey = sp.err ? `err_${sp.err}` as keyof typeof t : null;
  const error = sp.err === "credit" || sp.err === "trial" ? c.planError : errKey ? t[errKey] || t.err_generic : "";
  return <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-7 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px]">
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-6 rounded-[26px] border border-slate-200 bg-white p-7 sm:flex-row">{tr.avatar ? <img src={tr.avatar} alt={tr.name} width={144} height={144} className="h-36 w-36 rounded-3xl object-cover"/> : <span aria-hidden="true" className="grid h-36 w-36 shrink-0 place-items-center rounded-3xl bg-teal-50 text-4xl font-bold text-teal-800">{tr.name.split(" ").slice(0,2).map(part=>part[0]).join("")}</span>}<div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-bold tracking-tight text-teal-950">{tr.name}</h1></div><p className="mt-2 text-sm leading-6 text-slate-500">{tr.headline}</p><div className="mt-3 flex flex-wrap gap-4 text-xs"><span className="font-bold text-amber-600">★ {tr.rating.toFixed(2)}</span><span className="text-slate-400">{tr.reviewsCount} {t.reviews}</span><span className="text-slate-400">{tr.lessonsCount} {t.lessons}</span></div><p className="mt-3 text-xs text-slate-500">{t.speaks}: <b>{tr.speaks}</b></p><div className="mt-3 flex flex-wrap gap-1.5">{tr.tags.split(",").filter(Boolean).map(g=><span key={g} className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-semibold text-teal-700">{g}</span>)}</div></div></div>
      <div className="rounded-[26px] border border-slate-200 bg-white p-7"><h2 className="text-xl font-bold text-teal-950">{t.about}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600">{tr.bio}</p></div>
      <StudentAvailability instants={slots50} profileZone={viewerZone} lang={lang} serverNowMs={serverNowMs} />
      <div className="rounded-[26px] border border-slate-200 bg-white p-7"><h2 className="text-xl font-bold text-teal-950">★ {tr.rating.toFixed(1)} · {tr.reviewsCount} {t.reviews}</h2><div className="mt-4 divide-y divide-slate-100">{revs.map((r,i)=><div key={i} className="flex gap-3 py-4"><img src={r.avatar || ""} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 rounded-full bg-slate-100 object-cover"/><div><div className="text-sm font-semibold text-slate-700">{r.name} <span className="text-amber-500">{"★".repeat(r.rating)}</span></div><p className="mt-1 text-sm text-slate-500">{r.comment}</p></div></div>)}</div></div>
    </div>
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-24">
      <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-100/60"><div className="flex items-baseline justify-between gap-2"><div><span className="text-3xl font-bold tracking-tight text-teal-950">{money(tr.price)}</span><span className="ml-1 text-xs text-slate-400">/ 50 {c.minutes}</span></div></div>{error&&<p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error} {sp.err==="balance"&&<Link href="/dashboard?tab=wallet" className="underline">{t.topUp}</Link>}</p>}
        {user?.role === "student" ? <BookingPanel teacherId={tr.id} studentTimeZone={viewerZone} serverNowMs={serverNowMs} lang={lang} slots50={slots50} slots25={slots25} groupSlots={visibleGroupSlots} price={tr.price} trialEligible={!prev.length} balance={user.balance} t={t} c={c} credits={credits} initialPackageId={Number(sp.package)||undefined} initialDuration={sp.duration==="25"?25:50}/> : !user ? <Link href="/login" className="mt-5 block rounded-xl bg-teal-800 py-3 text-center text-sm font-bold text-white">{t.loginToBook}</Link> : <p className="mt-4 text-xs leading-5 text-slate-500">{t.studentsOnly}</p>}
        <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500"><li className="font-bold text-teal-900">{t.policyTitle}</li><li>{t.policy1}</li><li>{t.policy2}</li>{credits.length>0&&<li>{c.creditRestored}</li>}</ul>
      </div>
      <Link href={user?.role==="student"?`/dashboard?tab=packages&teacher=${tid}`:"/login"} className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-5 text-teal-800"><Icon name="box" className="shrink-0"/><div className="min-w-0 flex-1"><b className="text-sm">{c.packages}</b><p className="mt-0.5 text-[11px]">5% · 10% · 15% {c.off}</p></div><Icon name="chevron" width={17} height={17}/></Link>
      {user&&user.id!==tr.id&&<form action={sendMessage as unknown as (fd: FormData) => Promise<void>} className="rounded-[26px] border border-slate-200 bg-white p-6"><input type="hidden" name="to" value={tr.id}/><textarea name="body" required maxLength={2000} rows={3} placeholder={t.messagePlaceholder} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-500"/><button className="mt-2 w-full rounded-xl bg-teal-950 py-2.5 text-sm font-semibold text-white">{t.sendMessage}</button></form>}
    </aside>
  </div>;
}
