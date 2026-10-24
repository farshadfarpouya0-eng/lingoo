import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payouts, transactions, users, teacherProfiles, lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fmt } from "@/lib/time";
import { settleLessons } from "@/lib/money";

export const dynamic = "force-dynamic";
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const payStatus: Record<string, string> = { pending: "bg-amber-100 text-amber-800", paid: "bg-emerald-100 text-emerald-800", rejected: "bg-rose-100 text-rose-700" };
const lessonStatus: Record<string, string> = { completed: "bg-emerald-100 text-emerald-800", confirmed: "bg-sky-100 text-sky-700", pending: "bg-amber-100 text-amber-800", cancelled: "bg-slate-100 text-slate-500" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  await settleLessons().catch((e) => console.error("[admin] settle:", e));
  const { t, lang } = await (await import("@/lib/i18n")).getT();
  const { ok } = await searchParams;

  const [students, tutors, completed, pending, revenue, payoutsPending, usersTotal] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "student")),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "teacher")),
    db.select({ n: sql<number>`count(*)::int`, gmv: sql<number>`coalesce(sum(${lessons.price}),0)::int` }).from(lessons).where(eq(lessons.status, "completed")),
    db.select({ n: sql<number>`count(*)::int` }).from(lessons).where(sql`${lessons.status} in ('pending','confirmed')`),
    db.select({ n: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'topup'),0)::int` }).from(transactions),
    db.select({ n: sql<number>`count(*)::int` }).from(payouts).where(eq(payouts.status, "pending")),
    db.select({ n: sql<number>`count(*)::int` }).from(users),
  ]);
  const [recentTutors, recentUsers, recentPayouts, recentLessons] = await Promise.all([
    db.select({ id: users.id, name: users.name, rating: teacherProfiles.rating, lessons: teacherProfiles.lessonsCount, active: teacherProfiles.active })
        .from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId)).orderBy(desc(users.createdAt)).limit(6),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, suspended: users.suspended }).from(users).orderBy(desc(users.createdAt)).limit(8),
    db.select().from(payouts).orderBy(desc(payouts.createdAt)).limit(6),
    db.select().from(lessons).orderBy(desc(lessons.createdAt)).limit(8),
  ]);
  const kpis = [
    { label: "Users", value: String(usersTotal[0]?.n ?? 0), sub: `${students[0]?.n ?? 0} students · ${tutors[0]?.n ?? 0} tutors` },
    { label: "Completed", value: String(completed[0]?.n ?? 0) },
    { label: "Gross volume", value: money(completed[0]?.gmv || 0) },
    { label: "Top-up revenue", value: money(revenue[0]?.n || 0) },
    { label: "Pending payouts", value: String(payoutsPending[0]?.n ?? 0) },
    { label: "Active bookings", value: String(pending[0]?.n ?? 0) },
  ];
  const payLabel: Record<string, string> = { pending: t.payout_pending, paid: t.payout_paid, rejected: t.payout_rejected };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t.admin}</p>
          <h1 className="mt-1 text-3xl font-black text-teal-950">{t.overview}</h1>
        </div>
        <Link href="/dashboard" className="text-sm font-semibold text-teal-700">← {t.dashboard}</Link>
      </div>
      {ok === "saved" && <p className="mb-5 rounded-2xl bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800">{t.saved}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(k => (
          <div key={k.label} className="rounded-3xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k.label}</p>
            <p className="mt-2 text-2xl font-black text-teal-950">{k.value}</p>
            {k.sub && <p className="mt-1 text-[11px] text-slate-400">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-teal-950">Tutors</h2><Link href="/admin/tutors" className="text-xs font-semibold text-teal-700">Manage all →</Link></div>
          <div className="divide-y divide-slate-100">
            {recentTutors.map(t2 => (
                <div key={t2.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1"><p className="text-sm font-semibold text-slate-800">{t2.name}</p><p className="text-xs text-slate-400">★ {t2.rating.toFixed(1)} · {t2.lessons} lessons</p></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t2.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{t2.active ? "Active" : "Hidden"}</span>
                  <Link href={`/admin/tutors?edit=${t2.id}`} className="text-xs font-semibold text-teal-700">Edit</Link>
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-teal-950">Payouts</h2><Link href="/admin/payouts" className="text-xs font-semibold text-teal-700">All →</Link></div>
          <div className="divide-y divide-slate-100">
            {recentPayouts.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No payouts yet</p>}
            {recentPayouts.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2.5">
                  <div><p className="text-sm font-semibold text-slate-800">{money(p.amount)}</p><p className="text-xs text-slate-400">{p.method} · {p.account.slice(0, 14)}…</p></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${payStatus[p.status] ?? "bg-slate-100"}`}>{payLabel[p.status] ?? p.status}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-teal-950">Recent lessons</h2><Link href="/admin/lessons" className="text-xs font-semibold text-teal-700">All →</Link></div>
          <div className="divide-y divide-slate-100">
            {recentLessons.map(l => (
                <div key={l.id} className="flex items-center justify-between py-2.5">
                  <div><p className="text-sm font-semibold text-slate-800">Lesson #{l.id}</p><p className="text-xs text-slate-400">{fmt(l.startAt, lang)} · {l.duration} min</p></div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{money(l.price)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${lessonStatus[l.status] ?? "bg-slate-100"}`}>{t[`status_${l.status}` as keyof typeof t] ?? l.status}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-teal-950">Recent users</h2><Link href="/admin/students" className="text-xs font-semibold text-teal-700">Manage →</Link></div>
          <div className="divide-y divide-slate-100">
            {recentUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2.5">
                  <div><p className="text-sm font-semibold text-slate-800">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-violet-100 text-violet-700" : u.role === "teacher" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}`}>{u.role}{u.suspended ? " · suspended" : ""}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}