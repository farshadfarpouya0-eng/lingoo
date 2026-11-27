import Link from "next/link";
import { ASSESS } from "@/lib/assessment-i18n";
import type { Lang } from "@/lib/i18n";
import { getLatestAssessment, getTeachersByIds, selectedPlacementTutor } from "@/lib/placement";
import Icon from "./Icon";

export default async function AssessmentStatusCard({ userId, lang, timeZone }: {
  userId: number; lang: Lang; timeZone?: string | null;
}) {
  const a = ASSESS[lang];
  const latest = await getLatestAssessment(userId);

  const shell = "flex flex-wrap items-center justify-between gap-5 rounded-[22px] border border-teal-100 bg-white p-6 shadow-sm";
  const primary = "inline-flex items-center gap-2 rounded-full bg-teal-800 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-teal-900";
  const ghost = "inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-xs font-bold text-teal-800 transition hover:border-teal-400";

  if (!latest || latest.status !== "completed") {
    return (
      <section className={shell}>
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="book" width={23} height={23} /></span>
          <div>
            <h2 className="text-base font-bold text-teal-950">{a.dashCardNewTitle}</h2>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{a.dashCardNewText}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/assessment" className={primary}>{a.startTest}<Icon name="arrow" width={15} height={15} /></Link>
          <Link href="/dashboard?tab=packages" className={ghost}>{a.skipTestCta}</Link>
        </div>
      </section>
    );
  }

  const selected = selectedPlacementTutor(latest);
  if (selected) {
    const [teacher] = await getTeachersByIds([selected]);
    if (teacher) {
      return (
        <section className={shell}>
          <div className="flex items-center gap-4">
            {teacher.avatar
              ? <img src={teacher.avatar} alt="" width={48} height={48} className="h-12 w-12 rounded-2xl object-cover" />
              : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-lg font-bold text-teal-800">{teacher.name[0]}</span>}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">{a.dashCardTeacherTitle} · {latest.level}</p>
              <h2 className="text-base font-bold text-teal-950">{teacher.name}</h2>
              <p className="mt-0.5 max-w-md truncate text-xs text-slate-500">{teacher.headline}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/teachers/${teacher.id}`} className={primary}>{a.dashCardBook}<Icon name="arrow" width={15} height={15} /></Link>
            <Link href="/assessment/results" className={ghost}>{a.matchesTitle}</Link>
          </div>
        </section>
      );
    }
  }

  if (latest.status === "completed") {
    return (
      <section className={shell}>
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="user" width={23} height={23} /></span>
          <div>
            <h2 className="text-base font-bold text-teal-950">{a.dashCardMatchesTitle}</h2>
            <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{a.yourLevel}: <b className="text-teal-800">{latest.level}</b> · {a.dashCardMatchesText}</p>
          </div>
        </div>
        <Link href="/assessment/results" className={primary}>{a.dashCardViewMatches}<Icon name="arrow" width={15} height={15} /></Link>
      </section>
    );
  }

  return null;
}
