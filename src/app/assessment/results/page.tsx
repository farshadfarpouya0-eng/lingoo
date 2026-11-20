import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { ASSESS, type AssessmentCopy } from "@/lib/assessment-i18n";
import { getLatestCompletedAssessment, getTeachersByIds, rankTeachers, type MatchReason } from "@/lib/placement";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/placement-questions";
import { teacherVideoSrc } from "@/lib/teacher-video-url";
import { chooseTeacher } from "@/lib/assessment-actions";
import { money } from "@/lib/package-pricing";
import { getPricingConfig } from "@/lib/pricing-config";
import { ensureSeed } from "@/lib/seed";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your matched teachers" };

const REASON_KEY: Record<MatchReason, keyof AssessmentCopy> = {
  level: "reasonLevel", nearLevel: "reasonNearLevel", goal: "reasonGoal",
  kids: "reasonKids", language: "reasonLanguage", topRated: "reasonTopRated", introVideo: "reasonIntroVideo",
};

function VideoBlock({ src, poster, label, emptyLabel }: { src: string; poster?: string | null; label: string; emptyLabel: string }) {
  return (
    <figure>
      <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</figcaption>
      {src ? (
        <video controls preload="metadata" playsInline poster={poster || undefined} className="aspect-video w-full rounded-2xl bg-teal-950 object-cover">
          <source src={src} />
        </video>
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-2xl bg-slate-50 text-xs font-semibold text-slate-400">{emptyLabel}</div>
      )}
    </figure>
  );
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await ensureSeed();
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  const sp = await searchParams;
  const { lang } = await getT();
  const a = ASSESS[lang];

  const assessment = await getLatestCompletedAssessment(user.id);
  if (!assessment || !assessment.level) redirect("/assessment");
  const studentLevel: CefrLevel = (CEFR_LEVELS as readonly string[]).includes(assessment.level)
    ? (assessment.level as CefrLevel) : "A1";
  const ids = Array.isArray(assessment.recommendedIds) ? (assessment.recommendedIds as number[]) : [];
  const teachers = await getTeachersByIds(ids);
  const pricing = await getPricingConfig();
  const ranked = rankTeachers(
    teachers.map(tr => ({ id: tr.id, rating: tr.rating, reviewsCount: tr.reviewsCount, levels: tr.levels, tags: tr.tags, speaks: tr.speaks })),
    { level: studentLevel, goal: assessment.goal, audience: assessment.audience, nativeLang: user.nativeLang },
  );
  const reasonsById = new Map(ranked.map(r => [r.id, r.reasons]));
  const chosen = assessment.selectedTeacherId ? teachers.find(tr => tr.id === assessment.selectedTeacherId) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-700">{a.nav}</p>

      <section className="mt-3 rounded-[26px] bg-teal-900 p-7 text-white sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-200">{a.yourLevel}</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
          <span className="text-6xl font-extrabold tracking-tight">{assessment.level}</span>
          <div className="pb-1.5 text-sm leading-6 text-teal-100">
            {assessment.method === "written" && assessment.score !== null && (
              <p>{a.scoreLabel}: <b className="text-white">{assessment.score} / 15</b></p>
            )}
            {assessment.method === "live" && <p>{a.levelSetByTeacher}</p>}
            {assessment.goal && <p>{a.goalLabel}: <b className="text-white">{assessment.goal}</b></p>}
          </div>
        </div>
        {assessment.teacherNotes && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-6 text-teal-100">{assessment.teacherNotes}</p>}
      </section>

      {sp.err && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">{a.errGeneric}</p>}

      {chosen && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-teal-200 bg-teal-50 p-6">
          <div className="flex items-center gap-4">
            {chosen.avatar
              ? <img src={chosen.avatar} alt="" width={52} height={52} className="h-[52px] w-[52px] rounded-2xl object-cover" />
              : <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-white text-lg font-bold text-teal-800">{chosen.name[0]}</span>}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">{a.chosen}</p>
              <p className="font-bold text-teal-950">{chosen.name}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/teachers/${chosen.id}`} className="inline-flex items-center gap-2 rounded-full bg-teal-800 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-900">{a.bookFirst}<Icon name="arrow" width={15} height={15} /></Link>
            <Link href={`/dashboard?tab=packages&teacher=${chosen.id}`} className="inline-flex items-center gap-2 rounded-full border border-teal-300 bg-white px-5 py-2.5 text-sm font-bold text-teal-800 transition hover:bg-teal-50">{a.buyPackage}</Link>
          </div>
        </section>
      )}

      <h2 className="mt-10 text-2xl font-bold tracking-tight text-teal-950">{a.matchesTitle}</h2>
      <p className="mt-1.5 text-sm text-slate-500">{a.matchesSub}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {teachers.map((tr, idx) => {
          const isChosen = assessment.selectedTeacherId === tr.id;
          const levels = tr.levels.split(",").map(s => s.trim()).filter(Boolean);
          const tags = tr.tags.split(",").map(s => s.trim()).filter(Boolean);
          return (
            <article key={tr.id} className={`flex flex-col rounded-[26px] border bg-white p-6 ${isChosen ? "border-teal-500 ring-2 ring-teal-100" : "border-slate-200"}`}>
              <div className="flex items-start gap-4">
                {tr.avatar
                  ? <img src={tr.avatar} alt={tr.name} width={60} height={60} className="h-[60px] w-[60px] shrink-0 rounded-2xl object-cover" />
                  : <span className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-2xl bg-teal-50 text-xl font-bold text-teal-800">{tr.name[0]}</span>}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">#{idx + 1}</p>
                  <h3 className="truncate text-lg font-bold text-teal-950">{tr.name}</h3>
                  <p className="text-xs text-slate-400">{tr.accent} · {tr.country}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm font-bold text-amber-600">★ {tr.rating.toFixed(1)}</p>
                  <p className="text-[11px] text-slate-400">{tr.reviewsCount} {a.reviews}</p>
                </div>
              </div>

              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{tr.headline}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {(reasonsById.get(tr.id) ?? []).map(r => (
                  <span key={r} className="rounded-full bg-teal-700 px-2.5 py-1 text-[10px] font-bold text-white">{a[REASON_KEY[r]]}</span>
                ))}
                {tags.map(g => (
                  <span key={g} className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700">{g}</span>
                ))}
              </div>

              <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
                <div className="flex gap-2"><dt className="font-semibold text-slate-400">{a.speaks}:</dt><dd>{tr.speaks}</dd></div>
                {levels.length > 0 && (
                  <div className="flex gap-2"><dt className="font-semibold text-slate-400">{a.teachesLevels}:</dt><dd>{levels.join(" · ")}</dd></div>
                )}
                <div className="flex gap-2"><dt className="font-semibold text-slate-400">{a.lessons}:</dt><dd>{tr.lessonsCount}</dd></div>
              </dl>

              <div className="mt-5 space-y-4">
                <VideoBlock src={teacherVideoSrc(tr.id, "intro", tr.introVideoUrl)} poster={tr.avatar} label={a.introVideo} emptyLabel={a.noVideo} />
                <VideoBlock src={teacherVideoSrc(tr.id, "sample", tr.sampleVideoUrl)} poster={tr.avatar} label={a.sampleVideo} emptyLabel={a.noVideo} />
              </div>

              <p className="mt-4 line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-500">{tr.bio}</p>

              <div className="mt-5 flex items-baseline gap-1 border-t border-slate-100 pt-4">
                <span className="text-2xl font-bold tracking-tight text-teal-950">{money(pricing.student50)}</span>
                <span className="text-xs text-slate-400">{a.perLesson}</span>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {isChosen ? (
                  <Link href={`/teachers/${tr.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-800 py-3 text-sm font-bold text-white transition hover:bg-teal-900">
                    {a.bookFirst}<Icon name="arrow" width={15} height={15} />
                  </Link>
                ) : (
                  <form action={chooseTeacher}>
                    <input type="hidden" name="teacherId" value={tr.id} />
                    <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 py-3 text-sm font-bold text-white transition hover:bg-teal-900">
                      {a.choose} {tr.name.split(" ")[0]}<Icon name="arrow" width={15} height={15} />
                    </button>
                  </form>
                )}
                <Link href={`/teachers/${tr.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-teal-800 transition hover:border-teal-400">
                  {a.viewProfile}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/assessment/test" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-xs font-bold text-teal-800 transition hover:border-teal-400">{a.retake}</Link>
        <Link href="/assessment/live" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-xs font-bold text-teal-800 transition hover:border-teal-400">{a.bookLive}</Link>
      </div>
    </div>
  );
}
