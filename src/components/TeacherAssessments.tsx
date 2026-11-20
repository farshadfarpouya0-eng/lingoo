import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, users } from "@/db/schema";
import { ASSESS } from "@/lib/assessment-i18n";
import type { Lang } from "@/lib/i18n";
import { CEFR_LEVELS } from "@/lib/placement-questions";
import { submitLiveEvaluation } from "@/lib/assessment-actions";
import Icon from "./Icon";

export default async function TeacherAssessments({ teacherId, lang, timeZone, done, failed }: {
  teacherId: number; lang: Lang; timeZone?: string | null; done?: boolean; failed?: boolean;
}) {
  const a = ASSESS[lang];
  const rows = await db
    .select({ row: assessments, studentName: users.name, studentAvatar: users.avatar })
    .from(assessments)
    .innerJoin(users, eq(users.id, assessments.studentId))
    .where(and(eq(assessments.assignedTeacherId, teacherId), eq(assessments.status, "scheduled")))
    .orderBy(asc(assessments.scheduledAt));

  if (!rows.length && !done) return null;

  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500";

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon name="chart" width={20} height={20} /></span>
        <h2 className="text-lg font-bold text-teal-950">{a.evalTitle}</h2>
      </div>
      <p className="text-xs leading-5 text-slate-400">{a.evalJoinHint}</p>

      {done && <p role="status" className="mt-4 rounded-xl bg-teal-50 p-3 text-sm font-semibold text-teal-800">{a.evalDone}</p>}
      {failed && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{a.errGeneric}</p>}

      <div className="mt-4 space-y-4">
        {rows.map(({ row, studentName, studentAvatar }) => {
          const when = row.scheduledAt
            ? new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timeZone || "UTC" }).format(row.scheduledAt)
            : "";
          return (
            <article key={row.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-center gap-3">
                {studentAvatar
                  ? <img src={studentAvatar} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                  : <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-50 font-bold text-teal-800">{studentName[0]}</span>}
                <div className="text-sm">
                  <p className="font-bold text-teal-950">{studentName}</p>
                  <p className="text-xs text-slate-400">
                    {row.goal ? `${a.evalGoal}: ${row.goal} · ` : ""}{when}
                  </p>
                </div>
              </div>
              <form action={submitLiveEvaluation} className="mt-4 grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
                <input type="hidden" name="assessmentId" value={row.id} />
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{a.evalSetLevel}</span>
                  <select name="level" required defaultValue="B1" className={`${input} mt-1.5`}>
                    {CEFR_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{a.evalNotes}</span>
                  <input name="notes" maxLength={1000} className={`${input} mt-1.5`} />
                </label>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-teal-900">
                  {a.evalSubmit}<Icon name="arrow" width={14} height={14} />
                </button>
              </form>
            </article>
          );
        })}
        {!rows.length && <p className="py-2 text-sm text-slate-400">{a.evalEmpty}</p>}
      </div>
    </section>
  );
}
