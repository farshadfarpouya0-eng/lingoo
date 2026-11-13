import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, asc, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlatformEvents, lessons, teacherProfiles, users, learningMaterials, lessonPackages, lessonParticipants, classroomWorkspaceStates } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { LEARNING } from "@/lib/learning-i18n";
import { assignedTeacherLinks, classroomSnapshot } from "@/lib/room-service";
import { fmtAtZone } from "@/lib/time";
import ClassroomLive from "@/components/ClassroomLive";
import ClassroomPresence from "@/components/ClassroomPresence";
import RecordingConsentPanel from "@/components/RecordingConsentPanel";
import ReportParticipantForm from "@/components/ReportParticipantForm";
import { reportLessonIssue } from "@/lib/feature-actions";
import { canAccessLesson, activeLessonStudentIds } from "@/lib/lesson-access";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Classroom", robots: { index: false, follow: false } };

export default async function Classroom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ join?: string }> }) {
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
  const autoJoin = !isTutor && (await searchParams).join === "1" && snapshot.state === "open";
  const teacherLinks = await assignedTeacherLinks(l.teacherId);
  // Students learn only whether a room exists; the URL itself is revealed when the room opens.
  const assignedLinks = { meet: !!teacherLinks.meet, zoom: !!teacherLinks.zoom, ...(isTutor ? { meetUrl: teacherLinks.meet, zoomUrl: teacherLinks.zoom } : {}) };
  const courseStudentId = !isTutor && l.classType === "semi_private" ? user.id : l.studentId;
  const enrolledGroupRows = !isTutor && l.classType === "semi_private"
    ? await db.select({ lessonId: lessonParticipants.lessonId }).from(lessonParticipants).where(and(eq(lessonParticipants.studentId, user.id), inArray(lessonParticipants.status, ["booked", "attended"])))
    : [];
  const coursePackageId = (isTutor || l.classType !== "semi_private" || l.studentId === user.id) ? l.packageId : null;
  const courseLessonScope = coursePackageId
    ? eq(lessons.packageId, coursePackageId)
    : or(
        and(eq(lessons.studentId, courseStudentId), eq(lessons.teacherId, l.teacherId), isNull(lessons.packageId)),
        ...(enrolledGroupRows.length ? [and(inArray(lessons.id, enrolledGroupRows.map(x => x.lessonId)), eq(lessons.teacherId, l.teacherId))] : []),
      );
  const courseLessons = await db.select({ id: lessons.id, startAt: lessons.startAt, status: lessons.status }).from(lessons)
    .where(and(courseLessonScope, inArray(lessons.status, ["pending", "confirmed", "completed"])))
    .orderBy(asc(lessons.startAt), asc(lessons.id));
  const sessionNumber = Math.max(1, courseLessons.findIndex(x => x.id === l.id) + 1);
  const [packageRow] = coursePackageId ? await db.select({ totalLessons: lessonPackages.totalLessons }).from(lessonPackages).where(eq(lessonPackages.id, coursePackageId)).limit(1) : [];
  const sessionTotal = packageRow?.totalLessons ?? courseLessons.length;
  // Textbooks and audio are admin-managed teaching assets. They are available
  // inside the classroom only; students never get a standalone library view.
  // The teacher's in-room library is sourced from every published item in the
  // Admin → Materials catalogue (textbooks, audio courses and worksheets).
  // Drafts deliberately remain private until an administrator publishes them.
  const materialProjection = {
    id: learningMaterials.id,
    title: learningMaterials.title,
    kind: learningMaterials.kind,
    category: learningMaterials.category,
    language: learningMaterials.language,
    level: learningMaterials.level,
    fileUrl: learningMaterials.fileUrl,
    coverUrl: learningMaterials.coverUrl,
    description: learningMaterials.description,
  };
  const teachingMaterials = isTutor
    ? await db.select(materialProjection).from(learningMaterials)
        .where(eq(learningMaterials.published, true))
        .orderBy(asc(learningMaterials.kind), asc(learningMaterials.category), asc(learningMaterials.title))
    : await (async () => {
        // Do not serialize the entire admin catalogue or its lesson text/private
        // storage references to students. Only send the item the tutor selected.
        const [workspace] = await db.select({ state: classroomWorkspaceStates.state })
          .from(classroomWorkspaceStates).where(eq(classroomWorkspaceStates.lessonId, id)).limit(1);
        const selectedId = workspace?.state && typeof workspace.state === "object"
          ? Number((workspace.state as Record<string, unknown>).bookId)
          : NaN;
        if (!Number.isSafeInteger(selectedId) || selectedId < 1) return [];
        return db.select(materialProjection).from(learningMaterials)
          .where(and(eq(learningMaterials.id, selectedId), eq(learningMaterials.published, true))).limit(1);
      })();
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
            <p className="mt-1 text-xs font-semibold text-teal-700">Session {sessionNumber}{sessionTotal ? ` of ${sessionTotal}` : ""}</p>
          </div>
        </div>
        <Link href="/dashboard?tab=lessons" className="text-sm font-semibold text-teal-700">← {t.dashboard}</Link>
      </div>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2 px-1 text-sm font-bold text-teal-950">
              <Icon name="video" /> Live classroom
            </div>
            <ClassroomLive initial={snapshot} isTutor={isTutor} displayName={user.name} preference={pref?.platform || "lingo"} c={c} startLabel={fmtAtZone(l.startAt, lang, user.timeZone || "UTC")} startAtMs={l.startAt.getTime()} serverNowMs={Date.now()} durationMinutes={l.duration} books={teachingMaterials} userId={user.id} isAdmin={user.role === "admin"} profileTimeZone={user.timeZone || "UTC"} assignedLinks={assignedLinks} autoJoin={autoJoin} />
          </div>
          {snapshot.platform === "daily" && <RecordingConsentPanel lessonId={id} platform={snapshot.platform} />}
          <details className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-950">Need help? Report a lesson issue</summary>
          <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
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
          </details>
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
              <div className="flex justify-between gap-2"><dt>{t.startsAt}</dt><dd className="font-medium text-slate-700">{fmtAtZone(l.startAt, lang, user.timeZone || "UTC")} <span className="text-slate-400">· {(user.timeZone || "UTC").split("/").pop()?.replace(/_/g, " ")}</span></dd></div>
              <div className="flex justify-between"><dt>{c.duration}</dt><dd className="font-medium text-slate-700">{l.duration} {c.minutes}</dd></div>
              {l.packageId && <div className="flex justify-between"><dt>{c.packageCredit}</dt><dd>#{l.packageId}</dd></div>}
              {l.topic && <div><dt className="text-slate-400">{t.topic}</dt><dd className="mt-1 leading-5 text-slate-700">{l.topic}</dd></div>}
            </dl>
          </div>
          <div className="rounded-[22px] bg-teal-50/80 p-5">
            <Icon name="swap" className="text-teal-700" />
            <h2 className="mt-3 text-sm font-bold text-teal-950">{isTutor ? (c.switchPlatform || "Change the classroom") : "Classroom selection"}</h2>
            <p className="mt-2 text-xs leading-6 text-slate-500">{isTutor ? (c.switchRules || "The classroom can be changed until the lesson ends.") : "Only your tutor can choose or change the classroom. You will see the selected room here automatically."}</p>
          </div>
          {history.length > 0 && (
            <div className="rounded-[22px] border border-slate-200 bg-white p-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{c.history || "History"}</h2>
              <div className="mt-3 space-y-3">
                {history.map(h => (
                  <div key={h.id} className="border-b border-slate-50 pb-2 text-xs">
                    <p className="font-medium text-teal-800">{labels[h.fromPlatform]} → {labels[h.toPlatform]}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{fmtAtZone(h.createdAt, lang, user.timeZone || "UTC")}</p>
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