import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { ASSESS } from "@/lib/assessment-i18n";
import { getLatestAssessment, getTeachersByIds, selectedPlacementTutor } from "@/lib/placement";
import { ensureSeed } from "@/lib/seed";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Free English level test" };

export default async function AssessmentHome({ searchParams }: {
  searchParams: Promise<{ audience?: string; goal?: string; booked?: string; err?: string }>;
}) {
  await ensureSeed();
  const sp = await searchParams;
  const { lang } = await getT();
  const a = ASSESS[lang];
  const user = await getUser();
  const qs = new URLSearchParams();
  if (sp.audience) qs.set("audience", sp.audience);
  if (sp.goal) qs.set("goal", sp.goal);
  const suffix = qs.toString() ? `?${qs}` : "";

  const latest = user?.role === "student" ? await getLatestAssessment(user.id) : null;
  const selected = selectedPlacementTutor(latest);
  const chosen = selected ? (await getTeachersByIds([selected]))[0] : null;

  const card = "rounded-[26px] border border-slate-200 bg-white p-7";
  const primaryBtn = "inline-flex items-center gap-2 rounded-full bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-900";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-700">{a.nav}</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-teal-950 sm:text-4xl">{a.heroTitle}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">{a.heroText}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: "book" as const, title: a.step1, text: a.step1Text },
          { icon: "user" as const, title: a.step2, text: a.step2Text },
          { icon: "video" as const, title: a.step3, text: a.step3Text },
        ].map((s, i) => (
          <article key={s.title} className={card}>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name={s.icon} width={21} height={21} /></span>
            <p className="mt-4 text-[10px] font-bold tracking-widest text-slate-300">0{i + 1}</p>
            <h2 className="mt-1 font-bold text-teal-950">{s.title}</h2>
            <p className="mt-1.5 text-xs leading-5 text-slate-500">{s.text}</p>
          </article>
        ))}
      </div>

      {sp.err === "rate" && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-3 text-sm text-red-600">{a.errGeneric}</p>}

      {!user ? (
        <section className={`${card} mt-8 text-center`}>
          <h2 className="text-lg font-bold text-teal-950">{a.chooseMethod}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{a.loginNeeded}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={primaryBtn}>{a.registerWithoutTest}<Icon name="arrow" width={16} height={16} /></Link>
            <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-6 py-3 text-sm font-bold text-teal-900 transition hover:border-teal-400">{a.loginCta}</Link>
          </div>
        </section>
      ) : user.role !== "student" ? (
        <section className={`${card} mt-8`}><p className="text-sm text-slate-500">{a.teachersOnly}</p></section>
      ) : latest?.status === "completed" && chosen ? (
        <section className={`${card} mt-8`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">{a.chosen}</p>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {chosen.avatar
              ? <img src={chosen.avatar} alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-3xl object-cover" />
              : <span className="grid h-[72px] w-[72px] place-items-center rounded-3xl bg-teal-50 text-2xl font-bold text-teal-800">{chosen.name[0]}</span>}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-teal-950">{chosen.name}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{chosen.headline}</p>
              <p className="mt-1 text-xs text-slate-400">{a.yourLevel}: <b className="text-teal-800">{latest.level}</b></p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/teachers/${chosen.id}`} className={primaryBtn}>{a.bookFirst}<Icon name="arrow" width={16} height={16} /></Link>
              <Link href="/assessment/results" className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-teal-900 transition hover:border-teal-400">{a.matchesTitle}</Link>
            </div>
          </div>
        </section>
      ) : latest?.status === "completed" ? (
        <section className={`${card} mt-8 flex flex-wrap items-center justify-between gap-5`}>
          <div>
            <h2 className="text-lg font-bold text-teal-950">{a.dashCardMatchesTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{a.yourLevel}: <b className="text-teal-800">{latest.level}</b> · {a.dashCardMatchesText}</p>
          </div>
          <Link href="/assessment/results" className={primaryBtn}>{a.dashCardViewMatches}<Icon name="arrow" width={16} height={16} /></Link>
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-teal-950">{a.chooseMethod}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className={`${card} flex flex-col`}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="book" width={21} height={21} /></span>
              <h3 className="mt-4 font-bold text-teal-950">{a.writtenTitle}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">{a.writtenText}</p>
              <p className="mt-3 text-[11px] font-semibold text-teal-700">{a.writtenMeta}</p>
              <Link href={`/assessment/test${suffix}`} className={`${primaryBtn} mt-4 self-start`}>{a.startWritten}<Icon name="arrow" width={16} height={16} /></Link>
            </article>
            <article className={`${card} flex flex-col`}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-teal-700"><Icon name="user" width={21} height={21} /></span>
              <h3 className="mt-4 font-bold text-teal-950">{a.skipTestTitle}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-6 text-slate-500">{a.skipTestText}</p>
              <Link href="/dashboard?tab=packages" className={`${primaryBtn} mt-4 self-start`}>{a.skipTestCta}<Icon name="arrow" width={16} height={16} /></Link>
            </article>
          </div>
        </section>
      )}
    </div>
  );
}
