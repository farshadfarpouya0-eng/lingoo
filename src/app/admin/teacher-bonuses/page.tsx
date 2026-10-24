import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { DEFAULT_TEACHER_BONUS_POLICY, parseTeacherBonusPolicy, TEACHER_BONUS_SETTING } from "@/lib/teacher-bonus-policy";
import { saveTeacherBonusPolicy } from "@/lib/teacher-bonus-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teacher bonuses · Lingorain Admin" };
type Search = Promise<{ result?: string }>;
export default async function TeacherBonusesPage({ searchParams }: { searchParams: Search }) {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const [row] = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, TEACHER_BONUS_SETTING)).limit(1);
  const policy = row ? parseTeacherBonusPolicy(row.value) : DEFAULT_TEACHER_BONUS_POLICY;
  const query = await searchParams;
  return <>
    <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Transparent ranking & pay</p><h1 className="mt-1 text-3xl font-black text-teal-950">Teacher performance bonuses</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Configure an optional gross-price bonus for teachers with a strong verified review history. Bonus eligibility is evaluated when a lesson settles, and the bonus is recorded separately in the wallet ledger. The cap preserves at least 5% of gross lesson revenue for the platform after the standard 85% teacher share.</p></div>
    {query.result === "saved" && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Bonus policy saved.</p>}
    {query.result === "invalid" && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Check the policy ranges and try again.</p>}
    <form action={saveTeacherBonusPolicy as unknown as (fd: FormData) => Promise<void>} className="max-w-3xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6">
      <label className="flex items-start gap-3"><input name="enabled" type="checkbox" defaultChecked={policy.enabled} className="mt-1 h-4 w-4"/><span><b className="block text-sm text-teal-950">Enable performance bonuses</b><span className="mt-1 block text-xs leading-5 text-slate-500">Disabled by default. Turning this on affects newly settled lessons only; it does not recalculate past earnings.</span></span></label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">Minimum teacher rating<input name="minRating" type="number" step="0.1" min="4" max="5" required defaultValue={policy.minRating} className="mt-2 w-full rounded-xl border border-slate-200 p-3"/><span className="mt-1 block text-xs font-normal text-slate-400">4.0–5.0 stars</span></label>
        <label className="text-sm font-semibold text-slate-700">Minimum verified reviews<input name="minReviews" type="number" step="1" min="0" max="1000" required defaultValue={policy.minReviews} className="mt-2 w-full rounded-xl border border-slate-200 p-3"/><span className="mt-1 block text-xs font-normal text-slate-400">0–1,000 reviews</span></label>
        <label className="text-sm font-semibold text-slate-700">Bonus (% of lesson gross)<input name="percent" type="number" step="0.5" min="0" max="10" required defaultValue={policy.percent} className="mt-2 w-full rounded-xl border border-slate-200 p-3"/><span className="mt-1 block text-xs font-normal text-slate-400">0–10%; platform retains at least 5%</span></label>
      </div>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><b className="text-teal-950">Example:</b> on a $20 lesson, the normal teacher share is $17. With a 5% eligible bonus, the teacher receives an additional $1, for $18 total; the platform retains $2 before other costs. Eligibility is based on the teacher&apos;s rating and review count at settlement time.</div>
      <button className="rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white">Save bonus policy</button>
    </form>
  </>;
}
