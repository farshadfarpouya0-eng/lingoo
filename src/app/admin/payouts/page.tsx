import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payouts, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { fmt } from "@/lib/time";
import { PayoutActions } from "@/components/admin/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payouts" };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function AdminPayouts() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { t, lang } = await getT();
  const rows = await db.select({ p: payouts, name: users.name, email: users.email })
    .from(payouts).innerJoin(users, eq(users.id, payouts.teacherId))
    .orderBy(desc(payouts.createdAt)).limit(100);
  const [[pending]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(payouts).where(eq(payouts.status, "pending")),
  ]);
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-black text-teal-950">{t.payoutHistory}</h1>
        <p className="text-sm text-slate-500">{pending?.n ?? 0} pending</p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="divide-y divide-slate-100">
          {rows.map(({ p, name, email }) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{name} <span className="text-xs text-slate-400">{email}</span></p>
                <p className="text-sm text-slate-500">{usd(p.amount)} · {p.method}: <code className="text-xs">{p.account}</code> · {fmt(p.createdAt, lang)}</p>
                {p.note && <p className="text-xs text-slate-400">Note: {p.note}</p>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "paid" ? "bg-emerald-100 text-emerald-800" : p.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                {p.status === "paid" ? t.payout_paid : p.status === "rejected" ? t.payout_rejected : t.payout_pending}
              </span>
              {p.status === "pending" && <PayoutActions id={p.id} />}
            </div>
          ))}
          {!rows.length && <p className="py-8 text-center text-sm text-slate-400">No payout requests yet.</p>}
        </div>
      </div>
    </>
  );
}
