import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { accountingEntries, lessons, payouts, transactions, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { money } from "@/lib/package-pricing";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revenue" };

type Row = { amount: number; count: number };
type Side = { debit: number; credit: number };

async function accountTotals() {
  try {
    const rows = await db.select({
      accountCode: accountingEntries.accountCode,
      side: accountingEntries.side,
      total: sql<number>`coalesce(sum(${accountingEntries.amount}),0)::int`,
    }).from(accountingEntries).groupBy(accountingEntries.accountCode, accountingEntries.side);
    const map = new Map<string, Side>();
    for (const r of rows) {
      const cur = map.get(r.accountCode) ?? { debit: 0, credit: 0 };
      if (r.side === "debit") cur.debit += Number(r.total || 0); else cur.credit += Number(r.total || 0);
      map.set(r.accountCode, cur);
    }
    return { ok: true, map };
  } catch {
    return { ok: false, map: new Map<string, Side>() };
  }
}

async function transactionTotals() {
  try {
    const rows = await db.select({
      type: transactions.type,
      amount: sql<number>`coalesce(sum(${transactions.amount}),0)::int`,
      count: sql<number>`count(*)::int`,
    }).from(transactions).groupBy(transactions.type);
    const map = new Map<string, Row>();
    for (const r of rows) map.set(r.type, { amount: Number(r.amount || 0), count: Number(r.count || 0) });
    return map;
  } catch {
    return new Map<string, Row>();
  }
}

async function lessonTotals() {
  try {
    const [row] = await db.select({
      completed: sql<number>`count(*) filter (where ${lessons.status} = 'completed')::int`,
      gmv: sql<number>`coalesce(sum(${lessons.price}) filter (where ${lessons.status} = 'completed'),0)::int`,
      escrow: sql<number>`coalesce(sum(${lessons.price}) filter (where ${lessons.status} in ('pending','confirmed')),0)::int`,
      active: sql<number>`count(*) filter (where ${lessons.status} in ('pending','confirmed'))::int`,
    }).from(lessons);
    return { completed: Number(row?.completed || 0), gmv: Number(row?.gmv || 0), escrow: Number(row?.escrow || 0), active: Number(row?.active || 0) };
  } catch {
    return { completed: 0, gmv: 0, escrow: 0, active: 0 };
  }
}

async function payoutTotals() {
  try {
    const rows = await db.select({
      status: payouts.status,
      amount: sql<number>`coalesce(sum(${payouts.amount}),0)::int`,
      count: sql<number>`count(*)::int`,
    }).from(payouts).groupBy(payouts.status);
    const map = new Map<string, Row>();
    for (const r of rows) map.set(r.status, { amount: Number(r.amount || 0), count: Number(r.count || 0) });
    return map;
  } catch {
    return new Map<string, Row>();
  }
}

async function walletLiability() {
  try {
    const [row] = await db.select({ total: sql<number>`coalesce(sum(${users.balance}),0)::int` }).from(users);
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

export default async function AdminRevenue() {
  const me = await getUser();
  if (!me || me.role !== "admin") redirect("/login");

  const [accounts, txs, lt, pt, wallet] = await Promise.all([
    accountTotals(), transactionTotals(), lessonTotals(), payoutTotals(), walletLiability(),
  ]);

  const acc = (code: string) => accounts.map.get(code) ?? { debit: 0, credit: 0 };
  const tx = (type: string) => txs.get(type) ?? { amount: 0, count: 0 };

  const revenue = acc("platform_revenue").credit - acc("platform_revenue").debit;
  const marketing = acc("platform_marketing").debit - acc("platform_marketing").credit;
  const fees = acc("platform_fees").debit - acc("platform_fees").credit;
  const netProfit = revenue - marketing - fees;
  const pendingPayout = ["pending", "approved", "processing"].reduce((sum, status) => {
    const row = pt.get(status) ?? { amount: 0, count: 0 };
    return { amount: sum.amount + row.amount, count: sum.count + row.count };
  }, { amount: 0, count: 0 });
  const paidPayout = pt.get("paid") ?? { amount: 0, count: 0 };
  const tutorEarnings = tx("earning").amount + tx("performance_bonus").amount;

  const kpis = [
    { label: "Platform revenue", value: money(revenue), hint: "15% commission on completed lessons" },
    { label: "Gross lesson volume", value: money(lt.gmv), hint: `${lt.completed} completed lessons` },
    { label: "Paid to tutors", value: money(tutorEarnings), hint: "85% share + bonuses" },
    { label: "Net profit", value: money(netProfit), hint: "revenue − marketing − fees" },
  ];

  const obligations = [
    { label: "Held in escrow", value: money(lt.escrow), hint: `${lt.active} pending lessons`, icon: "clock" as const },
    { label: "Wallet liabilities", value: money(wallet), hint: "money users can still spend", icon: "wallet" as const },
    { label: "Outstanding payouts", value: money(pendingPayout.amount), hint: `${pendingPayout.count} pending, approved or processing`, icon: "alert" as const },
    { label: "Withdrawals paid", value: money(paidPayout.amount), hint: `${paidPayout.count} paid out`, icon: "shield" as const },
  ];

  const flows = [
    { label: "Top-ups", value: tx("topup").amount, count: tx("topup").count, positive: true },
    { label: "Tutor earnings", value: tutorEarnings, count: tx("earning").count + tx("performance_bonus").count, positive: false },
    { label: "Refunds", value: tx("refund").amount, count: tx("refund").count, positive: false },
    { label: "Marketing (bonus + referral)", value: marketing, count: tx("performance_bonus").count + tx("referral_marketing_cost").count, positive: false },
  ].filter(f => f.value > 0 || f.count > 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Admin · Finance</p>
          <h1 className="mt-1 text-3xl font-black text-teal-950">Revenue</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Commission, escrow and obligations — computed from the double-entry journal.</p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-teal-700">← Dashboard</Link>
      </div>

      {!accounts.ok && (
        <p role="alert" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The accounting journal could not be read — commission figures may be incomplete.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className={`rounded-3xl border p-5 ${i === 0 ? "border-teal-800 bg-teal-800 text-white" : "border-slate-200 bg-white"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${i === 0 ? "text-teal-100/70" : "text-slate-400"}`}>{k.label}</p>
            <p className={`mt-2 text-2xl font-black tracking-tight ${i === 0 ? "text-white" : "text-teal-950"}`}>{k.value}</p>
            <p className={`mt-1 text-[11px] ${i === 0 ? "text-teal-100/60" : "text-slate-400"}`}>{k.hint}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-teal-950">Obligations</h2>
            <p className="mt-1 text-xs text-slate-500">Money the platform holds but does not own.</p>
          </div>
          <Link href="/admin/payouts" className="text-xs font-semibold text-teal-700">Manage payouts →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {obligations.map(o => (
            <div key={o.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <Icon name={o.icon} className="text-teal-600" width={18} height={18} />
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{o.label}</p>
              <p className="mt-1 text-xl font-bold text-teal-950">{o.value}</p>
              <p className="mt-1 text-[11px] text-slate-400">{o.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-teal-950">Money movement</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {flows.map(f => (
              <div key={f.label} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                  <p className="text-[11px] text-slate-400">{f.count} transaction{f.count === 1 ? "" : "s"}</p>
                </div>
                <span className={`text-sm font-bold ${f.positive ? "text-emerald-700" : "text-slate-700"}`}>{f.positive ? "+" : "−"}{money(f.value)}</span>
              </div>
            ))}
            {!flows.length && <p className="py-6 text-center text-sm text-slate-400">No money has moved yet.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-teal-950">Profit &amp; loss</h2>
          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
              <dt className="font-semibold text-emerald-900">Commission revenue</dt>
              <dd className="font-bold text-emerald-800">{money(revenue)}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-slate-600">− Tutor bonuses &amp; referral rewards</dt>
              <dd className="font-semibold text-slate-700">{money(marketing)}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <dt className="text-slate-600">− Payment processing fees</dt>
              <dd className="font-semibold text-slate-700">{money(fees)}</dd>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-teal-800 px-4 py-3.5">
              <dt className="font-bold text-white">Net profit</dt>
              <dd className="text-lg font-black text-white">{money(netProfit)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Margin</p>
            <p className="mt-1 text-2xl font-bold text-teal-950">{lt.gmv > 0 ? `${((netProfit / lt.gmv) * 100).toFixed(1)}%` : "—"}</p>
            <p className="mt-1 text-[11px] text-slate-400">net profit vs gross lesson volume</p>
          </div>
        </section>
      </div>
    </>
  );
}
