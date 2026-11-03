import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonReports, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { resolveLessonReport } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export default async function Reports() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const rows = await db.select({ report: lessonReports, name: users.name, email: users.email })
    .from(lessonReports).innerJoin(users, eq(users.id, lessonReports.reporterId))
    .orderBy(desc(lessonReports.createdAt)).limit(200);
  return <>
    <h1 className="mb-2 text-3xl font-black text-teal-950">Lesson reports</h1>
    <p className="mb-6 text-sm text-slate-500">Review technical interruptions and class disputes. Reports do not automatically trigger refunds; decide and record the reason.</p>
    <div className="rounded-3xl border bg-white p-5">
      {rows.length ? rows.map(({ report: r, name, email }) => <article key={r.id} className="border-b py-5 last:border-0">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold text-slate-800">Report #{r.id} · Lesson #{r.lessonId} · {r.category}</h2><span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">{r.status}</span></div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{r.description}</p>
        <p className="mt-2 text-xs text-slate-400">Reported by {name} ({email}) · {r.createdAt.toLocaleString()}</p>
        {r.resolution && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Resolution: {r.resolution}</p>}
        <form action={resolveLessonReport as unknown as (fd: FormData) => Promise<void>} className="mt-4 grid gap-2 md:grid-cols-[170px_minmax(0,1fr)_auto]">
          <input type="hidden" name="id" value={r.id}/>
          <select name="status" defaultValue={r.status === "open" ? "investigating" : r.status} className="rounded-xl border p-3 text-sm"><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select>
          <input name="resolution" defaultValue={r.resolution} maxLength={1000} placeholder="Decision / resolution note (record the reason)" className="min-w-0 rounded-xl border p-3 text-sm"/>
          <button className="rounded-xl bg-teal-800 px-4 py-3 text-sm font-bold text-white">Save review</button>
        </form>
      </article>) : <p className="py-10 text-center text-sm text-slate-400">No reports yet.</p>}
    </div>
  </>;
}
