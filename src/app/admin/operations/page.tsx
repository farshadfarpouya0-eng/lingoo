import { desc } from "drizzle-orm";
import { db } from "@/db";
import { scheduledJobRuns } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { fmtAtZone } from "@/lib/time";
export const dynamic = "force-dynamic";
const statusClass: Record<string,string> = { running: "bg-sky-50 text-sky-700", succeeded: "bg-emerald-50 text-emerald-700", partial: "bg-amber-50 text-amber-800", failed: "bg-red-50 text-red-700" };
export default async function AdminOperationsPage() {
  const [user, { lang }] = await Promise.all([getUser(), getT()]);
  const rows = await db.select().from(scheduledJobRuns).orderBy(desc(scheduledJobRuns.startedAt)).limit(100);
  const latest = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!latest.has(row.job)) latest.set(row.job, row);
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-black text-teal-950">Scheduled operations</h1><p className="mt-1 text-sm leading-6 text-slate-500">Recent cron executions for reminders, lesson settlement and recording cleanup. Jobs write here only after migration 0014 is applied.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">{[...latest.values()].map(row => <div key={row.job} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{row.job}</p><span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[row.status] || "bg-slate-100 text-slate-600"}`}>{row.status}</span><p className="mt-2 text-xs text-slate-500">{fmtAtZone(row.startedAt, lang, user?.timeZone || "UTC")}</p>{row.durationMs !== null && <p className="mt-1 text-xs text-slate-400">{row.durationMs} ms</p>}</div>)}</div>
    <div className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="mb-3 text-lg font-bold text-teal-950">Execution history</h2><div className="divide-y divide-slate-100">{rows.map(row => <article key={row.id} className="grid gap-2 py-3 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-slate-800">{row.job}</b><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass[row.status] || "bg-slate-100 text-slate-600"}`}>{row.status}</span></div>{row.error && <p className="mt-1 break-words text-xs text-red-700">{row.error}</p>}<details className="mt-1 text-xs text-slate-400"><summary className="cursor-pointer">Run summary</summary><pre className="mt-1 overflow-auto rounded bg-slate-50 p-2">{JSON.stringify(row.summary, null, 2)}</pre></details></div><div className="text-left md:text-right"><p className="text-xs text-slate-500">{fmtAtZone(row.startedAt, lang, user?.timeZone || "UTC")}</p><p className="mt-1 text-xs text-slate-400">{row.durationMs === null ? "Running" : `${row.durationMs} ms`}</p></div></article>)}{!rows.length && <p className="py-8 text-center text-sm text-slate-400">No execution history available yet. Apply migration 0014, then call a scheduled endpoint to start collecting runs.</p>}</div></div>
  </section>;
}
