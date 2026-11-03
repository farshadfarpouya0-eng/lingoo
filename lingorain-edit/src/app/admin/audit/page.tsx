import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, users } from "@/db/schema";
import { fmtAtZone } from "@/lib/time";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
export const dynamic = "force-dynamic";
const usd = (v: number) => `${v < 0 ? "-" : ""}$${(Math.abs(v) / 100).toFixed(2)}`;
export default async function AdminAuditPage() {
  const { lang } = await getT();
  const user = await getUser();
  const rows = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(250);
  const ids = [...new Set(rows.flatMap(r => [r.adminId, ...(r.targetUserId ? [r.targetUserId] : [])]))];
  const people = ids.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : [];
  const byId = new Map(people.map(p => [p.id, p]));
  return <section className="rounded-3xl border border-slate-200 bg-white p-5">
    <div className="mb-5"><h1 className="text-2xl font-black text-teal-950">Admin audit log</h1><p className="mt-1 text-sm text-slate-500">Append-only history of balance changes, payout workflow decisions, account access, moderation and administrative actions. Latest 250 entries.</p></div>
    <div className="divide-y divide-slate-100">
      {rows.map(row => { const actor = byId.get(row.adminId); const target = row.targetUserId ? byId.get(row.targetUserId) : null; return <article key={row.id} className="grid gap-2 py-4 md:grid-cols-[1fr_auto]">
        <div><p className="font-semibold text-slate-800">{row.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">Admin: {actor?.name || `#${row.adminId}`} · Target: {target?.name || (row.targetUserId ? `#${row.targetUserId}` : "—")}{target?.email ? ` (${target.email})` : ""}</p>
          {row.note && <p className="mt-1 text-sm text-slate-600">{row.note}</p>}
          {row.reference && <p className="mt-1 break-all text-[11px] text-slate-400">Reference: {row.reference}</p>}
          {row.metadata !== null && row.metadata !== undefined && <details className="mt-1 text-[11px] text-slate-400"><summary className="cursor-pointer">Details</summary><pre className="mt-1 overflow-auto rounded bg-slate-50 p-2">{JSON.stringify(row.metadata, null, 2)}</pre></details>}
        </div>
        <div className="text-left md:text-right"><p className="font-bold tabular-nums text-teal-800">{row.amount ? usd(row.amount) : "—"}</p><p className="text-xs text-slate-400">{fmtAtZone(row.createdAt, lang, user?.timeZone || "UTC")}</p>{row.balanceBefore !== null && row.balanceAfter !== null && <p className="mt-1 text-[11px] text-slate-400">{usd(row.balanceBefore)} → {usd(row.balanceAfter)}</p>}</div>
      </article>; })}
      {!rows.length && <p className="py-10 text-center text-sm text-slate-400">No admin actions have been logged yet.</p>}
    </div>
  </section>;
}
