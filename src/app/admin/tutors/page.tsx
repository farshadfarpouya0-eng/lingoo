import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teacherProfiles, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { AdjustBalance, CreateTutorForm, DeleteTutor } from "@/components/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutors" };
const usd = (c: number) => `$${((c ?? 0) / 100).toFixed(0)}`;

export default async function AdminTutors() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { t } = await getT();
  const [rows, [totals]] = await Promise.all([
    db.select({
      id: users.id, name: users.name, email: users.email, suspended: users.suspended, balance: users.balance,
      active: teacherProfiles.active, certified: teacherProfiles.certified, rating: teacherProfiles.rating,
      lessonsCount: teacherProfiles.lessonsCount, price: teacherProfiles.price,
    })
      .from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId))
      .orderBy(desc(users.createdAt)).limit(100),
    db.select({
      tutors: sql<number>`count(*)::int`,
      students: sql<number>`count(*) filter (where ${users.role} = 'student')::int`,
      lessons: sql<number>`coalesce((select sum(${teacherProfiles.lessonsCount}) from ${teacherProfiles}),0)::int`,
    }).from(users),
  ]);
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-black text-teal-950">Tutors</h1>
        <p className="text-sm text-slate-500">{totals?.tutors ?? 0} tutors · {totals?.students ?? 0} students · {totals?.lessons ?? 0} lessons</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <CreateTutorForm />
        <div className="mt-4 divide-y divide-slate-100">
          {rows.map(row => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{row.name} {row.suspended && <span className="text-xs text-red-500">· suspended</span>}</p>
                <p className="truncate text-xs text-slate-400">{row.email} · ★ {(row.rating ?? 0).toFixed(1)} · {row.lessonsCount ?? 0} lessons · {usd(row.price)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{row.active ? "Active" : "Hidden"}</span>
              <div className="flex w-full flex-wrap items-center justify-between gap-3 pl-0 sm:pl-2"><span className="text-xs text-slate-500">Account balance: <b className="text-teal-800">{usd(row.balance)}</b> <span className="text-slate-400">(withdrawable)</span></span><AdjustBalance id={row.id} /></div>
              <Link href={`/admin/tutors?edit=${row.id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</Link>
              <DeleteTutor id={row.id} />
            </div>
          ))}
          {!rows.length && <p className="py-8 text-center text-sm text-slate-400">No tutors yet.</p>}
        </div>
      </div>
    </>
  );
}