import { redirect } from "next/navigation";
import { asc, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessons, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/time";
import { CancelLesson } from "@/components/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lessons" };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const STATUS: Record<string, string> = { pending: "bg-amber-100 text-amber-800", confirmed: "bg-sky-100 text-sky-800", completed: "bg-emerald-100 text-emerald-800", cancelled: "bg-slate-100 text-slate-500" };

export default async function AdminLessons() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { t, lang } = await getT();
  const [rows2, [summary]] = await Promise.all([
    db.select({
      id: lessons.id, startAt: lessons.startAt, duration: lessons.duration, price: lessons.price, status: lessons.status,
      student: sql<string>`(select u.name from users u where u.id = ${lessons.studentId})`,
      studentEmail: sql<string>`(select u.email from users u where u.id = ${lessons.studentId})`,
      tutor: sql<string>`(select u.name from users u where u.id = ${lessons.teacherId})`,
      tutorEmail: sql<string>`(select u.email from users u where u.id = ${lessons.teacherId})`,
    }).from(lessons).orderBy(desc(lessons.startAt)).limit(120),
    db.select({ total: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${lessons.status} in ('pending','confirmed'))::int` }).from(lessons),
  ]);
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-black text-teal-950">{t.myLessons}</h1>
        <p className="text-sm text-slate-500">{summary?.total ?? 0} total · {summary?.active ?? 0} active</p>
      </div>
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-2">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="px-3 py-2">When</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Tutor</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
          <tbody>
            {rows2.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmt(r.startAt, lang)} · {r.duration}m</td>
                <td className="px-3 py-2"><span className="font-semibold text-slate-800">{r.student}</span><br /><span className="text-xs text-slate-400">{r.studentEmail}</span></td>
                <td className="px-3 py-2"><span className="font-semibold text-slate-800">{r.tutor}</span><br /><span className="text-xs text-slate-400">{r.tutorEmail}</span></td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{usd(r.price)}</td>
                <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status]}`}>{t[`status_${r.status}` as keyof typeof t] ?? r.status}</span></td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{(r.status === "pending" || r.status === "confirmed") && <CancelLesson id={r.id} />}</td>
              </tr>
            ))}
            {!rows2.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">No lessons yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
