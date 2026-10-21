import { redirect } from "next/navigation";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { lessons, teacherProfiles, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import {
  CreateTestLesson, TestLessonControls, SwitchUserButtons, BackToAdminButton,
} from "@/components/admin/TestingActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Testing" };

const statusStyle: Record<string, string> = {
  confirmed: "bg-sky-100 text-sky-700",
  pending: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export default async function AdminTesting() {
  const me = await getUser();
  if (!me || me.role !== "admin") redirect("/login");

  const [students, tutorRows, testLessons] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.role, "student")).orderBy(users.name).limit(100),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId)).orderBy(users.name).limit(100),
    db.select({
      id: lessons.id, startAt: lessons.startAt, duration: lessons.duration,
      status: lessons.status, platform: lessons.platform, topic: lessons.topic,
      studentId: lessons.studentId, studentName: users.name,
    })
      .from(lessons).innerJoin(users, eq(users.id, lessons.studentId))
      .where(or(like(lessons.topic, "[TEST]%"), like(lessons.topic, "\\[TEST\\]%")))
      .orderBy(desc(lessons.createdAt)).limit(30),
  ]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Admin · Sandbox</p>
          <h1 className="mt-1 text-3xl font-black text-teal-950">Classroom testing</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Spin up a fake lesson between any student and tutor, then jump straight into the classroom as either side.
            Nothing here touches payments or real bookings.
          </p>
        </div>
        {me.role === "admin" && (
          <div className="rounded-full bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900">
            Signed in as admin #{me.id}
          </div>
        )}
      </div>

      <CreateTestLesson students={students} tutors={tutorRows} />

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-teal-950">Test lessons</h2>
        <div className="divide-y divide-slate-100">
          {testLessons.map(l => {
            const roomUrl = `/classroom/${l.id}`;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    Lesson #{l.id}
                    <span className="ml-2 text-xs text-slate-400">{l.studentName}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(l.startAt).toLocaleString()} · {l.duration} min · {l.platform}
                  </p>
                </div>

                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyle[l.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {l.status}
                </span>

                <a
                  href={roomUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50"
                >
                  Open classroom ↗
                </a>

                <div className="flex w-full flex-wrap items-center gap-2">
                  <TestLessonControls id={l.id} studentId={l.studentId} />
                </div>
              </div>
            );
          })}

          {!testLessons.length && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-teal-700">
                <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3h6M10 3v5L5 19a2 2 0 002 3h10a2 2 0 002-3l-5-11V3M8 14h8" />
                </svg>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700">No test lessons yet</p>
              <p className="mt-1 text-xs text-slate-400">Create one above to open the classroom instantly.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 text-lg font-bold text-teal-950">Quick switches</h2>
        <p className="mb-3 text-xs text-slate-500">
          Jump into any account without knowing the password. Your admin session is saved and you can come back anytime.
        </p>
        <div className="flex flex-wrap gap-2">
          {tutorRows.map(t => (
            <SwitchUserButtons key={t.id} id={t.id} label={`As tutor: ${t.name}`} />
          ))}
          {students.map(s => (
            <SwitchUserButtons key={s.id} id={s.id} label={`As student: ${s.name}`} />
          ))}
        </div>
      </div>
    </>
  );
}