import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { lessonPackages, lessons, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, users, teacherDocuments, referralLessonCredits, userPresence, lessonParticipants, reviews } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { LEARNING } from "@/lib/learning-i18n";
import { money } from "@/lib/package-pricing";
import PackageDashboard from "@/components/PackageDashboard";
import DashboardLessons, { DashboardLessonRow } from "@/components/DashboardLessons";
import TimetableManager from "@/components/TimetableManager";
import ProfileForm from "@/components/ProfileForm";
import WalletPanel from "@/components/WalletPanel";
import MessagesPanel from "@/components/MessagesPanel";
import DashboardRefresh from "@/components/DashboardRefresh";
import Icon, { type IconName } from "@/components/Icon";
import { dashboardSummary, upcomingForUser } from "@/lib/dashboard-summary";
import { isValidTimeZone, tzFor } from "@/lib/time";
import TeacherDocumentUploadForm from "@/components/TeacherDocumentUploadForm";
import ReferralPanel from "@/components/ReferralPanel";
import PresencePrivacySetting from "@/components/PresencePrivacySetting";
import TeacherProfileProgress from "@/components/TeacherProfileProgress";
import ProfileAvatarUploadForm from "@/components/ProfileAvatarUploadForm";
import TeacherClassTest from "@/components/TeacherClassTest";
import { referralProgress } from "@/lib/referral-service";

async function ReferralDashboardBlock({ userId, code }: { userId: number; code: string | null }) {
  const [progress, credits] = await Promise.all([
    referralProgress(userId),
    db.select({ duration: referralLessonCredits.duration, remaining: sql<number>`sum(${referralLessonCredits.remainingLessons})::int` })
      .from(referralLessonCredits).where(eq(referralLessonCredits.userId, userId)).groupBy(referralLessonCredits.duration),
  ]);
  const credit25 = Number(credits.find(c => c.duration === 25)?.remaining || 0);
  const credit50 = Number(credits.find(c => c.duration === 50)?.remaining || 0);
  return <ReferralPanel code={code} qualified={progress.qualified % 3} rewardChoices={progress.rewardChoices} credits25={credit25} credits50={credit50} />;
}

export const dynamic = "force-dynamic";
export const metadata = { title: "My learning", robots: { index: false, follow: false } };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tab?: string; with?: string; teacher?: string; ok?: string; err?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  const { t, lang } = await getT();
  const c = LEARNING[lang];
  const sp = await searchParams;
  const isTutor = user.role === "teacher";
  const requested = sp.tab || "overview";
  const allowedTabs = ["overview", "packages", "lessons", "schedule", "test", "messages", "wallet", "profile"];
  const tab = allowedTabs.includes(requested) && !(isTutor && requested === "packages") && (isTutor || (requested !== "schedule" && requested !== "test")) ? requested : "overview";

  const other = alias(users, "other");
  const needsRows = tab === "overview" || tab === "lessons";

  const groupSeatRows = !isTutor && needsRows
    ? await db.select({ lessonId: lessonParticipants.lessonId }).from(lessonParticipants)
        .where(and(eq(lessonParticipants.studentId, user.id), inArray(lessonParticipants.status, ["booked", "attended"])))
    : [];
  const groupLessonIds = [...new Set(groupSeatRows.map(r => r.lessonId))];
  const studentLessonScope = groupLessonIds.length
    ? or(eq(lessons.studentId, user.id), inArray(lessons.id, groupLessonIds))
    : eq(lessons.studentId, user.id);

  const rowQuery = db.select({ l: lessons, otherName: other.name, otherAvatar: other.avatar, otherId: other.id, teacherTimeZone: teacherProfiles.timeZone })
    .from(lessons)
    .innerJoin(other, eq(other.id, isTutor ? lessons.studentId : lessons.teacherId))
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, lessons.teacherId))
    .where(tab === "overview"
      ? (isTutor ? upcomingForUser(user.id, true) : and(studentLessonScope, inArray(lessons.status, ["pending", "confirmed"])))
      : (isTutor ? eq(lessons.teacherId, user.id) : studentLessonScope))
    .orderBy(asc(lessons.startAt));

  const now = Date.now();

  const [[fresh], rows, [tutor], [credits], summary, contacts, weeklySlots, blockedSlots, scheduleBookings, [presenceSetting]] = await Promise.all([
    db.select({ balance: users.balance }).from(users).where(eq(users.id, user.id)),
    needsRows ? (tab === "overview" ? rowQuery.limit(5) : rowQuery) : Promise.resolve([]),
    /* always load the tutor profile so the approval banner can show on every tab */
    isTutor ? db.select().from(teacherProfiles).where(eq(teacherProfiles.userId, user.id)) : Promise.resolve([]),
    !isTutor && tab === "overview" ? db.select({ total: sql<number>`coalesce(sum(${lessonPackages.remainingLessons}),0)::int` }).from(lessonPackages).where(eq(lessonPackages.studentId, user.id)) : Promise.resolve([{ total: 0 }]),
    tab === "overview" || (isTutor && tab === "wallet") ? dashboardSummary(user.id, isTutor) : Promise.resolve({ completedLessons: 0, completedMinutes: 0, students: 0, escrow: 0, grossCompleted: 0 }),
    tab === "messages" ? db.selectDistinct({ id: isTutor ? lessons.studentId : lessons.teacherId }).from(lessons).where(eq(isTutor ? lessons.teacherId : lessons.studentId, user.id)) : Promise.resolve([]),
    isTutor && tab === "schedule" ? db.select({ weekday: teacherWeeklySlots.weekday, startMinute: teacherWeeklySlots.startMinute, endMinute: teacherWeeklySlots.endMinute }).from(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, user.id)) : Promise.resolve([]),
    isTutor && tab === "schedule" ? db.select().from(teacherBlockedSlots).where(and(eq(teacherBlockedSlots.teacherId, user.id), gte(teacherBlockedSlots.endAt, new Date()))).orderBy(asc(teacherBlockedSlots.startAt)).limit(60) : Promise.resolve([]),
    /* 3 weeks back → 6 weeks ahead, matching the timetable week navigation */
    isTutor && tab === "schedule"
      ? db.select({ startAt: lessons.startAt, duration: lessons.duration, status: lessons.status, studentName: other.name })
          .from(lessons).innerJoin(other, eq(other.id, lessons.studentId))
          .where(and(
            eq(lessons.teacherId, user.id),
            inArray(lessons.status, ["pending", "confirmed", "completed", "cancelled"]),
            gte(lessons.startAt, new Date(now - 21 * 86400_000)),
            lte(lessons.startAt, new Date(now + 42 * 86400_000)),
          ))
          .orderBy(asc(lessons.startAt)).limit(400)
      : Promise.resolve([]),
    db.select({ visible: userPresence.visible }).from(userPresence).where(eq(userPresence.userId, user.id)).limit(1),
  ]);

  const teacherDocs = isTutor && (tab === "profile" || tab === "overview")
    ? await db.select().from(teacherDocuments).where(eq(teacherDocuments.teacherId, user.id)).orderBy(asc(teacherDocuments.createdAt))
    : [];
  const identityVerified = teacherDocs.some(d => d.documentType === "identity" && d.status === "verified");
  const identityPending = teacherDocs.some(d => d.documentType === "identity" && d.status === "pending");
  const teacherProfileItems = isTutor ? [
    { key: "photo", label: "Profile photo", points: 15, complete: Boolean(user.avatarStorageRef), href: "#profile-photo" },
    { key: "headline", label: "Teaching headline", points: 10, complete: Boolean(tutor?.headline?.trim() && tutor.headline.trim().toLowerCase() !== "new english tutor"), href: "#profile-form" },
    { key: "bio", label: "Teaching biography (80+ characters)", points: 15, complete: (tutor?.bio?.trim().length || 0) >= 80, href: "#profile-form" },
    { key: "price", label: "Lesson price", points: 10, complete: Boolean(tutor && tutor.price >= 500), href: "#profile-form" },
    { key: "languages", label: "Languages you teach/speak", points: 10, complete: Boolean(tutor?.speaks?.trim() && tutor.speaks.trim().length >= 3), href: "#profile-form" },
    { key: "subjects", label: "Subjects and specialties", points: 10, complete: Boolean(tutor?.tags?.split(",").some(tag => tag.trim().length > 1)), href: "#profile-form" },
    { key: "availability", label: "Working days and hours", points: 10, complete: Boolean(tutor && tutor.workDays.split(",").some(Boolean) && tutor.endHour > tutor.startHour), href: "#profile-form" },
    { key: "timezone", label: "Teacher time zone", points: 5, complete: isValidTimeZone(tutor?.timeZone), href: "#profile-form" },
    { key: "identity", label: "Identity document verified", points: 15, complete: identityVerified, pending: identityPending, href: "#documents" },
  ] : [];

  // The profile row contains an encrypted payout credential. Never serialize it
  // into props for client components; only server-side payout actions need it.
  const safeTutor = tutor ? { ...tutor, payoutAccount: "" } : undefined;
  const balance = fresh?.balance ?? user.balance;
  const reviewedLessonIds = !isTutor && needsRows
    ? new Set((await db.select({ lessonId: reviews.lessonId }).from(reviews).where(eq(reviews.studentId, user.id))).map(r => r.lessonId).filter((v): v is number => v !== null))
    : new Set<number>();
  const displayRows = rows.map(row => ({ ...row, reviewedByMe: reviewedLessonIds.has(row.l.id) }));
  const upcoming = displayRows.filter(x => ["pending", "confirmed"].includes(x.l.status));
  const escrow = summary.escrow;

  const courseProgress = tab === "overview" ? await (async () => {
    const packages = await db.select({ pack: lessonPackages, otherName: other.name })
      .from(lessonPackages).innerJoin(other, eq(other.id, isTutor ? lessonPackages.studentId : lessonPackages.teacherId))
      .where(eq(isTutor ? lessonPackages.teacherId : lessonPackages.studentId, user.id))
      .orderBy(desc(lessonPackages.createdAt)).limit(12);
    if (!packages.length) return [];
    const ids = packages.map(x => x.pack.id);
    const counts = await db.select({
      packageId: lessons.packageId,
      completed: sql<number>`count(*) filter (where ${lessons.status} = 'completed')::int`,
      booked: sql<number>`count(*) filter (where ${lessons.status} in ('pending','confirmed'))::int`,
    }).from(lessons).where(inArray(lessons.packageId, ids)).groupBy(lessons.packageId);
    const countByPackage = new Map(counts.map(c => [c.packageId, c]));
    return packages.map(x => ({ ...x, completed: Number(countByPackage.get(x.pack.id)?.completed || 0), booked: Number(countByPackage.get(x.pack.id)?.booked || 0) }));
  })() : [];

  const nav: { key: string; label: string; icon: IconName; href?: string }[] = [
    { key: "overview", label: t.overview, icon: "chart" },
    ...(!isTutor ? [{ key: "packages", label: c.packages, icon: "box" as IconName }] : []),
    { key: "lessons", label: t.myLessons, icon: "calendar" },
    ...(isTutor ? [{ key: "schedule", label: t.scheduleTab, icon: "clock" as IconName }, { key: "test", label: "LingoRoom Demo", icon: "video" as IconName }] : []),
    { key: "messages", label: t.messages, icon: "messages" },
    { key: "wallet", label: t.wallet, icon: "wallet" },
    { key: "profile", label: t.profile, icon: "user" },
  ];

  let content: React.ReactNode;

  if (tab === "packages") {
    content = <PackageDashboard studentId={user.id} balance={balance} lang={lang} tutorId={Number(sp.teacher) || undefined} />;
  } else if (tab === "lessons") {
    content = <><DashboardRefresh /><DashboardLessons rows={displayRows} isTutor={isTutor} t={t} c={c} lang={lang} booked={sp.ok === "booked"} /></>;
  } else if (tab === "test" && isTutor) {
    content = <TeacherClassTest />;
  } else if (tab === "schedule" && isTutor) {
    content = <TimetableManager teacherId={user.id} tzOffset={tutor?.tzOffset ?? 0} timeZone={tutor?.timeZone || user.timeZone || "UTC"} initialSlots={weeklySlots} blocked={blockedSlots} booked={scheduleBookings} t={t} lang={lang} viewerLabel={tzFor(lang, user.timeZone).label} okMsg={sp.ok === "saved" ? t.saved : ""} errMsg={sp.err ? (t[`err_${sp.err}` as keyof typeof t] || t.err_generic) : ""} />;
  } else if (tab === "wallet") {
    content = <WalletPanel userId={user.id} isTutor={isTutor} balance={balance} escrow={escrow} tutor={safeTutor} t={t} c={c} lang={lang} timeZone={user.timeZone} ok={sp.ok} err={sp.err} />;
  } else if (tab === "messages") {
    content = <MessagesPanel userId={user.id} contactIds={contacts.map(x => x.id)} selectedId={Number(sp.with) || undefined} t={t} lang={lang} timeZone={user.timeZone} />;
  } else if (tab === "profile") {
    content = (
      <div className="space-y-5">
        <PresencePrivacySetting visible={presenceSetting?.visible ?? true} />
        {!isTutor && <><ProfileAvatarUploadForm avatar={user.avatar} /><ProfileForm user={user} t={t} c={c} lang={lang} saved={sp.ok === "saved"} /></>}
        {isTutor && (
          <>
            <div id="profile-photo" className="scroll-mt-28"><ProfileAvatarUploadForm avatar={user.avatar} /></div>
            <div id="profile-form" className="scroll-mt-28"><ProfileForm user={user} tutor={safeTutor} t={t} c={c} lang={lang} saved={sp.ok === "saved"} /></div>
            <TeacherProfileProgress items={teacherProfileItems} credentialVerified={Boolean(tutor?.credentialVerified)} />
            <section id="documents" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-3"><h2 className="text-lg font-bold text-teal-950">Identity and optional credentials</h2><p className="mt-1 text-sm text-slate-500">Identity verification is required. University certificates and teaching credentials are optional and can add a public trust badge after review.</p></div>
              <TeacherDocumentUploadForm />
              {teacherDocs.length > 0 && <div className="mt-5 space-y-2">{teacherDocs.map(d => <div key={d.id} className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span>{d.documentType}{d.optionalCredential ? " · optional" : ""}</span><span className="text-xs font-semibold text-slate-500">{d.status}</span></div>)}</div>}
            </section>
          </>
        )}
      </div>
    );
  } else {
    const stats: { label: string; value: string; icon: IconName }[] = isTutor
      ? [{ label: t.availableBalance, value: money(balance), icon: "wallet" }, { label: t.pendingEarnings, value: money(escrow), icon: "clock" }, { label: t.totalLessons, value: String(summary.completedLessons), icon: "book" }, { label: t.students, value: String(summary.students), icon: "user" }]
      : [{ label: t.balance, value: money(balance), icon: "wallet" }, { label: c.packageCredit, value: String(credits.total), icon: "box" }, { label: t.totalLessons, value: String(summary.completedLessons), icon: "book" }, { label: t.hoursLearned, value: (summary.completedMinutes / 60).toFixed(1), icon: "clock" }];

    content = (
      <div className="space-y-6">
        <DashboardRefresh />
        {isTutor && <TeacherProfileProgress items={teacherProfileItems} credentialVerified={Boolean(tutor?.credentialVerified)} />}
        {isTutor && (
          <Link href="/dashboard?tab=test" className="group flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-teal-100 bg-white p-5 shadow-sm transition hover:border-teal-300">
            <div className="flex items-center gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="video" width={22} height={22} /></span>
              <div><h2 className="text-sm font-bold text-teal-950">LingoRoom Demo</h2><p className="mt-1 text-xs leading-5 text-slate-500">Practice in LingoRoom and check your camera, microphone, and speakers before your first lesson.</p></div>
            </div>
            <span className="flex items-center gap-2 text-xs font-bold text-teal-800">Open Demo Room <Icon name="arrow" width={15} height={15} /></span>
          </Link>
        )}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className={`rounded-[22px] border p-5 ${i === 0 ? "border-teal-800 bg-teal-800 text-white" : "border-slate-200 bg-white text-teal-950"}`}>
              <Icon name={s.icon} className={i === 0 ? "text-teal-200" : "text-teal-600"} />
              <p className={`mt-4 text-[10px] font-semibold ${i === 0 ? "text-teal-100/70" : "text-slate-400"}`}>{s.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{s.value}</p>
            </div>
          ))}
        </div>

        {!isTutor && (
          <Link href="/dashboard?tab=packages" className="group flex flex-wrap items-center justify-between gap-5 rounded-[22px] bg-[#eaf3ee] p-6">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-teal-700"><Icon name="box" width={24} height={24} /></span>
              <div>
                <h2 className="text-lg font-bold text-teal-950">{c.packageTitle}</h2>
                <p className="mt-1 text-xs text-slate-500">{c.flexible} · 5%, 10%, 15% {c.off}</p>
              </div>
            </div>
            <span className="flex items-center gap-2 text-xs font-semibold text-teal-800">{c.browse}<Icon name="arrow" width={16} height={16} /></span>
          </Link>
        )}

        {!isTutor && tab === "overview" && <ReferralDashboardBlock userId={user.id} code={user.referralCode} />}

        {tab === "overview" && courseProgress.length > 0 && (
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-teal-950">Course progress</h2>
              <p className="mt-1 text-xs text-slate-500">Completed lessons are counted only after the teacher marks them completed or they auto-settle.</p>
            </div>
            <div className="space-y-4">
              {courseProgress.map(({ pack, otherName, completed, booked }) => {
                const percent = Math.min(100, Math.round(completed / Math.max(1, pack.totalLessons) * 100));
                return (
                  <article key={pack.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-teal-950">{otherName}</h3>
                        <p className="mt-1 text-xs text-slate-500">{pack.duration}-minute package · {pack.totalLessons} total sessions</p>
                      </div>
                      <strong className="text-lg text-teal-800">{percent}%</strong>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${percent}%` }} /></div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <span>Held: <b className="text-teal-800">{completed}</b></span>
                      <span>Booked / pending: <b className="text-sky-700">{booked}</b></span>
                      <span>Credits remaining: <b className="text-teal-800">{pack.remainingLessons}</b></span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-teal-950">{t.upcoming}</h2>
            <Link href="/dashboard?tab=lessons" className="text-xs font-semibold text-teal-700">{t.viewAll} →</Link>
          </div>
          <div className="space-y-3">
            {upcoming.slice(0, 5).map(row => (
              <DashboardLessonRow key={row.l.id} row={row} isTutor={isTutor} t={t} c={c} lang={lang} />
            ))}
          </div>
          {!upcoming.length && (
            <p className="py-5 text-sm text-slate-400">
              {t.noLessons} {!isTutor && <Link href="/dashboard?tab=packages" className="ml-2 text-teal-700">{c.packages} →</Link>}
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:py-9">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t.welcome}</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-teal-950">
            {user.name}
            <span className="ml-3 rounded-full border border-slate-200 bg-white px-2.5 py-1 align-middle text-[10px] font-medium tracking-normal text-slate-400">{isTutor ? t.teacher : t.student}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard?tab=wallet" className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500 sm:flex">
            <Icon name="wallet" width={15} height={15} />{money(balance)}
          </Link>
          <img src={user.avatar || ""} alt={user.name} width={40} height={40} className="h-10 w-10 rounded-full object-cover ring-4 ring-white" />
        </div>
      </div>

      {isTutor && tutor && !tutor.active && (
        <div className="mb-6 rounded-[22px] border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 text-amber-950"><Icon name="alert" width={18} height={18} /></span>
            <div>
              <h2 className="text-sm font-bold text-amber-950">Your tutor profile is waiting for approval</h2>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">Students can&apos;t see your profile yet. Our team activates new tutors by hand. Uploading your ID helps us verify you faster, but your profile only goes live once an admin approves it.</p>
              <Link href="/dashboard?tab=profile#documents" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-300">Upload documents →</Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24">
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-1.5">
            {nav.map(item => (
              <Link key={item.key} href={item.href || `/dashboard?tab=${item.key}`} aria-current={item.href ? undefined : tab === item.key ? "page" : undefined} className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-xs font-semibold transition ${tab === item.key ? "bg-[#123e39] text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-teal-800"}`}>
                <Icon name={item.icon} width={17} height={17} className={tab === item.key ? "text-teal-200" : "text-slate-400"} />
                {item.label}
                {item.key === "packages" && <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] ${tab === "packages" ? "bg-white/15 text-teal-100" : "bg-teal-50 text-teal-700"}`}>−15%</span>}
              </Link>
            ))}
          </nav>
          <div className="mt-8 hidden rounded-2xl border border-slate-200 bg-white p-5 lg:block">
            <Icon name="shield" className="text-teal-700" />
            <p className="mt-3 text-xs font-semibold text-teal-950">{t.policyTitle}</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">{isTutor ? c.switchRules : c.paymentPolicy}</p>
            <Link href={isTutor ? `/teachers/${user.id}` : "/dashboard?tab=packages"} className="mt-4 flex items-center gap-2 text-[11px] font-bold text-teal-700">
              {isTutor ? t.publicProfile : c.packages}<Icon name="arrow" width={13} height={13} />
            </Link>
          </div>
        </aside>
        <div className="min-w-0">{content}</div>
      </div>
    </div>
  );
}
