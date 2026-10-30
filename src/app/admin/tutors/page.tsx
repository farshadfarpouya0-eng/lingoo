import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teacherProfiles, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { setTeacherActive } from "@/lib/admin-actions";
import { AdjustBalance, CreateTutorForm, DeleteTutor } from "@/components/admin/actions";
import TeacherEditForm from "./TeacherEditForm";
import type { IdStatus, TRow } from "./types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutors" };
const usd = (c: number) => `$${((c ?? 0) / 100).toFixed(0)}`;

/** Status of the tutor's identity document: verified > pending > rejected > none. */
const idStatusSql = sql<IdStatus>`case
  when exists (select 1 from teacher_documents d where d.teacher_id = ${users.id} and d.document_type = 'identity' and d.status = 'verified') then 'verified'
  when exists (select 1 from teacher_documents d where d.teacher_id = ${users.id} and d.document_type = 'identity' and d.status = 'pending') then 'pending'
  when exists (select 1 from teacher_documents d where d.teacher_id = ${users.id} and d.document_type = 'identity' and d.status = 'rejected') then 'rejected'
  else 'none' end`;
const ID_BADGE: Record<IdStatus, { text: string; cls: string }> = {
  verified: { text: "ID verified", cls: "bg-emerald-50 text-emerald-700" },
  pending: { text: "ID waiting for review", cls: "bg-amber-50 text-amber-800" },
  rejected: { text: "ID rejected", cls: "bg-red-50 text-red-700" },
  none: { text: "No ID yet", cls: "bg-slate-100 text-slate-500" },
};

type Search = Promise<{ edit?: string; filter?: string }>;
export default async function AdminTutors({ searchParams }: { searchParams: Search }) {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { t } = await getT();
  const { edit, filter } = await searchParams;

  if (edit) {
    const id = Number(edit);
    const [r] = await db.select({
      id: users.id, name: users.name, email: users.email, avatar: users.avatar, nativeLang: users.nativeLang, suspended: users.suspended, balance: users.balance,
      active: teacherProfiles.active, certified: teacherProfiles.certified, rating: teacherProfiles.rating, reviewsCount: teacherProfiles.reviewsCount,
      lessonsCount: teacherProfiles.lessonsCount, price: teacherProfiles.price, startHour: teacherProfiles.startHour, endHour: teacherProfiles.endHour,
      tzOffset: teacherProfiles.tzOffset, timeZone: teacherProfiles.timeZone, workDays: teacherProfiles.workDays, headline: teacherProfiles.headline, bio: teacherProfiles.bio,
      country: teacherProfiles.country, accent: teacherProfiles.accent, speaks: teacherProfiles.speaks, tags: teacherProfiles.tags,
      payoutMethod: teacherProfiles.payoutMethod, idStatus: idStatusSql,
    }).from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId)).where(and(eq(users.id, id), eq(users.role, "teacher")));
    if (!r) redirect("/admin/tutors");
    const row: TRow = { ...r, avatar: r.avatar ?? "", nativeLang: r.nativeLang ?? "en", payoutAccount: "" };
    return (
      <>
        <div className="mb-5"><Link href="/admin/tutors" className="text-sm font-semibold text-teal-700">← Back to tutors</Link><h1 className="mt-2 text-3xl font-black text-teal-950">Edit tutor · {row.name}</h1></div>
        <TeacherEditForm key={row.id} row={row} t={t} />
      </>
    );
  }

  const mode = filter === "waiting" || filter === "active" ? filter : "all";
  const [rows, [totals]] = await Promise.all([
    db.select({
      id: users.id, name: users.name, email: users.email, suspended: users.suspended, balance: users.balance,
      active: teacherProfiles.active, certified: teacherProfiles.certified, rating: teacherProfiles.rating,
      lessonsCount: teacherProfiles.lessonsCount, price: teacherProfiles.price, idStatus: idStatusSql,
    })
      .from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(mode === "waiting" ? eq(teacherProfiles.active, false) : mode === "active" ? eq(teacherProfiles.active, true) : undefined)
      // Tutors waiting for approval first (false sorts before true), newest first.
      .orderBy(asc(teacherProfiles.active), desc(users.createdAt)).limit(200),
    db.select({
      tutors: sql<number>`count(*)::int`,
      waiting: sql<number>`count(*) filter (where ${teacherProfiles.active} = false)::int`,
      lessons: sql<number>`coalesce(sum(${teacherProfiles.lessonsCount}),0)::int`,
    }).from(teacherProfiles),
  ]);
  const tab = (key: string, label: string, count?: number) => (
    <Link key={key} href={key === "all" ? "/admin/tutors" : `/admin/tutors?filter=${key}`}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${mode === key ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
      {label}{count !== undefined ? ` (${count})` : ""}
    </Link>
  );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-black text-teal-950">Tutors</h1>
        <p className="text-sm text-slate-500">{totals?.tutors ?? 0} tutors · {totals?.lessons ?? 0} lessons</p>
      </div>
      {(totals?.waiting ?? 0) > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>{totals?.waiting} tutor{totals?.waiting === 1 ? " is" : "s are"} waiting for approval.</b> They stay hidden from students until you press <b>Activate</b>.
        </div>
      )}
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <CreateTutorForm />
        <div className="mt-4 flex flex-wrap gap-2">{tab("all", "All", totals?.tutors ?? 0)}{tab("waiting", "Waiting for approval", totals?.waiting ?? 0)}{tab("active", "Active", (totals?.tutors ?? 0) - (totals?.waiting ?? 0))}</div>
        <div className="mt-4 divide-y divide-slate-100">
          {rows.map(row => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{row.name} {row.suspended && <span className="text-xs text-red-500">· suspended</span>}</p>
                <p className="truncate text-xs text-slate-400">{row.email} · ★ {(row.rating ?? 0).toFixed(1)} · {row.lessonsCount ?? 0} lessons · {usd(row.price)}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ID_BADGE[row.idStatus].cls}`}>{ID_BADGE[row.idStatus].text}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.active ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{row.active ? "Active" : "Waiting for approval"}</span>
              <form action={setTeacherActive}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="active" value={row.active ? "0" : "1"} />
                <button className={`rounded-lg px-3 py-1.5 text-xs font-bold ${row.active ? "border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{row.active ? "Hide" : "Activate"}</button>
              </form>
              <div className="flex w-full flex-wrap items-center justify-between gap-3 pl-0 sm:pl-2"><span className="text-xs text-slate-500">Account balance: <b className="text-teal-800">{usd(row.balance)}</b> <span className="text-slate-400">(withdrawable)</span></span><AdjustBalance id={row.id} /></div>
              <Link href={`/admin/tutors?edit=${row.id}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</Link>
              <DeleteTutor id={row.id} />
            </div>
          ))}
          {!rows.length && <p className="py-8 text-center text-sm text-slate-400">No tutors in this list.</p>}
        </div>
      </div>
    </>
  );
}
