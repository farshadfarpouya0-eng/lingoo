import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlatformEvents, lessons, teacherProfiles, users, learningMaterials, materialPurchases } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { LEARNING } from "@/lib/learning-i18n";
import { classroomSnapshot } from "@/lib/room-service";
import { fmt } from "@/lib/time";
import ClassroomLive from "@/components/ClassroomLive";
import ClassroomChat from "@/components/ClassroomChat";
import ClassroomPresence from "@/components/ClassroomPresence";
import RecordingConsentPanel from "@/components/RecordingConsentPanel";
import ReportParticipantForm from "@/components/ReportParticipantForm";
import { reportLessonIssue } from "@/lib/feature-actions";
import { canAccessLesson, activeLessonStudentIds } from "@/lib/lesson-access";
import Icon from "@/components/Icon";
import ClassroomTeachingWorkspace from "@/components/ClassroomTeachingWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classroom", robots: { index: false, follow: false } };

export default async function Classroom({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [l] = await db.select().from(lessons).where(eq(lessons.id, id));
  if (!l || !(await canAccessLesson(id, user.id)) || (user.role === "admin" && !l.topic.startsWith("[TEST]"))) notFound();
  const { t, lang } = await getT();
  const c = LEARNING[lang];
  const isTutor = user.role === "admin" ? l.topic.startsWith("[TEST]") : user.id === l.teacherId;
  const [other] = await db.select({ id: users.id, name: users.name, avatar: users.avatar }).from(users).where(eq(users.id, isTutor ? l.studentId : l.teacherId));
  const groupStudentIds = l.classType === "semi_private" ? await activeLessonStudentIds(l.id, l.studentId, l.classType) : [l.studentId];
  const groupStudents = groupStudentIds.length ? await db.select({ id: users.id, name: users.name, avatar: users.avatar }).from(users).where(inArray(users.id, groupStudentIds)) : [];
  const reportTargets = (isTutor ? groupStudents : [{ id: other?.id || l.teacherId, name: other?.name || "Teacher", avatar: other?.avatar || "" }, ...groupStudents]).filter((person, index, all) => person.id !== user.id && all.findIndex(p => p.id === person.id) === index).map(p => ({ id: p.id, name: p.name }));
  const [pref] = isTutor ? await db.select({ platform: teacherProfiles.platformDefault }).from(teacherProfiles).where(eq(teacherProfiles.userId, user.id)) : [];
  const snapshot = await classroomSnapshot(user.id, id, user.name);
  const courseLessons = await db.select({ id: lessons.id, startAt: lessons.startAt, status: lessons.status }).from(lessons).where(and(eq(lessons.studentId, l.studentId), eq(lessons.teacherId, l.teacherId))).orderBy(asc(lessons.startAt));
  const sessionNumber = Math.max(1, courseLessons.findIndex(x => x.id === l.id) + 1);
  const publishedMaterials = await db.select({ id: learningMaterials.id, title: learningMaterials.title, level: learningMaterials.level, fileUrl: learningMaterials.fileUrl, description: learningMaterials.description, isFree: learningMaterials.isFree }).from(learningMaterials).where(eq(learningMaterials.published, true)).orderBy(asc(learningMaterials.title)).limit(200);
  const purchased = user.role === "student" ? await db.select({ materialId: materialPurchases.materialId }).from(materialPurchases).where(and(eq(materialPurchases.userId, user.id), eq(materialPurchases.status, "paid"))) : [];
  const purchasedIds = new Set(purchased.map(x => x.materialId));
  const teachingMaterials = publishedMaterials.filter(m => user.role === "teacher" || user.role === "admin" || m.isFree || purchasedIds.has(m.id)).map(({ isFree: _isFree, ...m }) => m);
  const history = await db.select().from(lessonPlatformEvents).where(eq(lessonPlatformEvents.lessonId, id)).orderBy(desc(lessonPlatformEvents.createdAt), desc(lessonPlatformEvents.id)).limit(6);
  const labels: Record<string, string> = {
    undecided: c.pendingBadge || "Not chosen",
    lingo: c.roomLingo || "Lingo Room",
    daily: "Daily secure room",
    meet: c.roomMeet || "Google Meet",
    zoom: c.roomZoom || "Zoom",
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-800 text-white"><Icon name="video" /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Lingorain · #{id}</p>
            <h1 className="text-2xl font-bold tracking-tight text-teal-950">{t.classroom}</h1>
            <p className="mt-1 text-xs font-semibold text-teal-700">Session {sessionNumber}{courseLessons.length ? ` of ${courseLessons.length}` : ""}</p>
          </div>
        </div>
        <Link href="/dashboard?tab=lessons" className="text-sm font-semibold text-teal-700">← {t.dashboard}</Link>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="space-y-5">
          <ClassroomTeachingWorkspace lessonId={id} books={teachingMaterials} isTutor={isTutor} userId={user.id} />
          <ClassroomLive initial={snapshot} isTutor={isTutor} preference={pref?.platform || "lingo"} c={c} startLabel={fmt(l.startAt, lang)} startAtMs={l.startAt.getTime()} durationMinutes={l.duration} />
          <RecordingConsentPanel lessonId={id} platform={snapshot.platform} />
          <ClassroomChat lessonId={id} userId={user.id} />
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-bold text-amber-950">Report a lesson issue</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900/75">If internet or technical problems disrupt the lesson, report what happened. Support will review it; a report does not automatically guarantee a refund or replacement.</p>
            <form action={reportLessonIssue as unknown as (fd: FormData) => Promise<void>} className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
              <input type="hidden" name="lessonId" value={id} />
              <select name="category" className="rounded-xl border border-amber-200 bg-white p-3 text-sm">
                <option value="internet">Internet disconnected</option>
                <option value="audio_video">Audio / video</option>
                <option value="classroom">Could not enter class</option>
                <option value="payment">Payment / booking</option>
                <option value="other">Other issue</option>
              </select>
              <input name="description" required minLength={8} maxLength={3000} placeholder="Describe the problem and when it happened" className="rounded-xl border border-amber-200 bg-white p-3 text-sm" />
              <button className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-amber-950">Send report</button>
            </form>
          </section>
          <ReportParticipantForm lessonId={id} targets={reportTargets} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-[22px] border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-teal-950">{t.lessonInfo}</h2>
            {l.classType === "semi_private" && (
              <div className="mt-3 rounded-xl bg-teal-50 p-3">
                <p className="text-xs font-bold text-teal-900">Semi-private class · {groupStudents.length}/{l.capacity} students</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {groupStudents.map(s => (
                    <span key={s.id} className="rounded-full bg-white px-2.5 py-1 text-[11px] text-teal-800">{s.name}{s.id === l.studentId ? " · host" : ""}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex items-center gap-3">
              <img src={other?.avatar || ""} alt="" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
              <div>
                <b className="text-sm text-slate-800">{other?.name}</b>
                <p className="mt-0.5 text-xs text-slate-400">{isTutor ? t.student : t.teacher}</p>
              </div>
            </div>
            <ClassroomPresence lessonId={id} otherName={other?.name || (isTutor ? t.student : t.teacher)} />
            <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <div className="flex justify-between gap-2"><dt>{t.startsAt}</dt><dd className="font-medium text-slate-700">{fmt(l.startAt, lang)}</dd></div>
              <div className="flex justify-between"><dt>{c.duration}</dt><dd className="font-medium text-slate-700">{l.duration} {c.minutes}</dd></div>
              {l.packageId && <div className="flex justify-between"><dt>{c.packageCredit}</dt><dd>#{l.packageId}</dd></div>}
              {l.topic && <div><dt className="text-slate-400">{t.topic}</dt><dd className="mt-1 leading-5 text-slate-700">{l.topic}</dd></div>}
            </dl>
          </div>
          <div className="rounded-[22px] bg-teal-50/80 p-5">
            <Icon name="swap" className="text-teal-700" />
            <h2 className="mt-3 text-sm font-bold text-teal-950">{c.switchPlatform || "Change the classroom"}</h2>
            <p className="mt-2 text-xs leading-6 text-slate-500">{c.switchRules || "The classroom can be changed until the lesson ends."}</p>
          </div>
          {history.length > 0 && (
            <div className="rounded-[22px] border border-slate-200 bg-white p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{c.history || "History"}</h2>
              <div className="mt-3 space-y-3">
                {history.map(h => (
                  <div key={h.id} className="border-b border-slate-50 pb-2 text-xs">
                    <p className="font-medium text-teal-800">{labels[h.fromPlatform]} → {labels[h.toPlatform]}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{fmt(h.createdAt, lang)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}