import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { settleLessons } from "@/lib/money";
import StudentEditForm, { type StudentRow } from "./StudentEditForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Students" };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function AdminStudents({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  await settleLessons();
  const { t } = await getT();
  const { edit } = await searchParams;

  if (edit) {
    const id = Number(edit);
    const [row] = await db.select({ id: users.id, name: users.name, email: users.email, balance: users.balance, level: users.level, suspended: users.suspended })
      .from(users).where(and(eq(users.role, "student"), eq(users.id, id)));
    if (!row) redirect("/admin/students");
    const r: StudentRow = { id: row.id, name: row.name, email: row.email, balance: row.balance, level: row.level ?? "A1", suspended: row.suspended };
    return (
      <>
        <div className="mb-5"><Link href="/admin/students" className="text-sm font-semibold text-teal-700">← Back to students</Link><h1 className="mt-2 text-3xl font-black text-teal-950">Edit student</h1></div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5"><StudentEditForm row={r} t={t} /></div>
      </>
    );
  }

  const [students, totals] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, balance: users.balance, level: users.level, suspended: users.suspended })
        .from(users).where(eq(users.role, "student")).orderBy(desc(users.createdAt)).limit(200),
      db.select({ count: sql<number>`count(*)::int`, balance: sql<number>`coalesce(sum(${users.balance}),0)::int`, active: sql<number>`count(*) filter (where ${users.suspended} = false)::int` })
        .from(users).where(eq(users.role, "student")),
    ]);
  const T = totals[0] ?? { count: 0, balance: 0, active: 0 };
  void totals;
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-black text-teal-950">Students</h1>
        <p className="text-sm text-slate-500">{T.count} students · {T.active} active · {usd(T.balance)} total balance</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="divide-y divide-slate-100">
          {students.map(s => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{s.name} {s.suspended && <span className="text-xs text-red-500">· suspended</span>}</p><p className="truncate text-xs text-slate-400">{s.email} · {s.level} · {usd(s.balance)}</p></div>
              <Link href={`/admin/students?edit=${s.id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</Link>
            </div>
          ))}
          {!students.length && <p className="py-6 text-center text-sm text-slate-400">No students yet.</p>}
        </div>
      </div>
    </>
  );
}

