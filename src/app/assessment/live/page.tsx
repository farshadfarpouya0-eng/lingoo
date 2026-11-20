import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { ASSESS } from "@/lib/assessment-i18n";
import { GOALS } from "@/lib/placement-questions";
import { requestLiveAssessment } from "@/lib/assessment-actions";
import { isValidTimeZone } from "@/lib/time";
import LiveAssessmentTimeInput from "@/components/LiveAssessmentTimeInput";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book a free live assessment" };

export default async function LiveAssessmentPage({ searchParams }: {
  searchParams: Promise<{ audience?: string; goal?: string; err?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  const sp = await searchParams;
  const { lang } = await getT();
  const a = ASSESS[lang];
  const goal = sp.goal && (GOALS as readonly string[]).includes(sp.goal) ? sp.goal : "";
  const timeZone = isValidTimeZone(user.timeZone) ? user.timeZone : "UTC";

  const label = "text-xs font-bold uppercase tracking-wider text-slate-400";
  const input = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-700">{a.nav}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-teal-950">{a.liveFormTitle}</h1>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">{a.liveFormText}</p>

      {sp.err && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-600">{sp.err === "unavailable" ? a.noAvailable : sp.err === "time" ? a.timeError : a.errGeneric}</p>}

      <form action={requestLiveAssessment} className="mt-7 rounded-[26px] border border-slate-200 bg-white p-6 sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="lv-audience">{a.audienceLabel}</label>
            <select id="lv-audience" name="audience" defaultValue={sp.audience === "kids" ? "kids" : "adults"} className={input}>
              <option value="adults">{a.adults}</option>
              <option value="kids">{a.kids}</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="lv-goal">{a.goalLabel}</label>
            <select id="lv-goal" name="goal" defaultValue={goal} className={input}>
              <option value="">{a.goalAny}</option>
              {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-6">
          <label className={label} htmlFor="lv-when">{a.pickTime}</label>
          <LiveAssessmentTimeInput id="lv-when" inputClass={input} accountTimeZone={timeZone} minLabel={`${a.timeZoneHint} · ${a.timeSlotHint}`} />
        </div>
        <button type="submit" className="mt-7 inline-flex items-center gap-2 rounded-full bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-900">
          {a.requestLive}<Icon name="arrow" width={16} height={16} />
        </button>
      </form>
    </div>
  );
}
