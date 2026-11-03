import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cryptoPaymentOrders, users } from "@/db/schema";
import { approveCryptoPayment, rejectCryptoPayment } from "@/lib/crypto-admin-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crypto payments · Lingorain Admin" };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default async function AdminCryptoPayments({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select({ order: cryptoPaymentOrders, studentName: users.name, studentEmail: users.email })
    .from(cryptoPaymentOrders).innerJoin(users, eq(users.id, cryptoPaymentOrders.userId))
    .orderBy(desc(cryptoPaymentOrders.createdAt)).limit(150);
  const pending = rows.filter(row => row.order.status === "pending_review").length;
  const result = sp.result === "approved" ? "Payment approved and wallet credited." : sp.result === "rejected" ? "Payment rejected." : sp.result === "note_required" ? "Enter a reason before rejecting a payment." : sp.result === "already_reviewed" ? "This payment has already been reviewed." : sp.result === "invalid" ? "Invalid payment request." : "";
  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">Wallet funding</p><h1 className="mt-1 text-3xl font-black text-teal-950">Crypto payments</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Review direct wallet transfers here, including USDT, BNB and TRX. A submitted transaction hash does not credit the student's wallet; only an explicit admin approval does.</p></div><div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{pending} awaiting review</div></div>
    {result&&<p role="status" className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-teal-900">{result}</p>}
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      {rows.map(({ order, studentName, studentEmail })=><article key={order.id} className="border-b border-slate-100 p-5 last:border-0">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-teal-950">#{order.id} · {studentName} <span className="font-normal text-slate-400">{studentEmail}</span></p><p className="mt-1 text-sm text-slate-600">{usd(order.amountUsd)} · {order.payAmount ? `${order.payAmount} ${order.asset.startsWith("usdt") ? "USDT" : order.asset.startsWith("bnb") ? "BNB" : "TRX"}` : "crypto amount pending"} · {order.asset.toUpperCase()} · {order.network} · {order.provider}</p><p className="mt-1 text-xs text-slate-400">Created {order.createdAt.toISOString()} · Status: {order.status}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === "paid" ? "bg-emerald-50 text-emerald-700" : order.status === "pending_review" ? "bg-amber-50 text-amber-800" : order.status === "rejected" || order.status === "failed" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{order.status.replaceAll("_", " ")}</span></div>
        {order.payAddress&&<p className="mt-2 break-all text-xs text-slate-500">Receiving address: {order.payAddress}</p>}
        {order.txHash&&<p className="mt-2 break-all text-xs text-slate-700">Transaction hash: <code>{order.txHash}</code></p>}
        {order.adminNote&&<p className="mt-2 text-xs text-slate-500">Review note: {order.adminNote}</p>}
        {order.status === "pending_review"&&<div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs leading-5 text-slate-600">Before approval, independently verify the transaction on the correct blockchain explorer: receiving address, network, token, amount and successful confirmation must all match this request.</p>
          <form action={approveCryptoPayment as unknown as (fd:FormData)=>Promise<void>} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={order.id}/><label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Admin note (optional)<input name="note" maxLength={300} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Verified on-chain"/></label><button className="rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white">Approve & credit wallet</button></form>
          <form action={rejectCryptoPayment as unknown as (fd:FormData)=>Promise<void>} className="flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={order.id}/><label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Reason for rejection<input name="note" required maxLength={300} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="Payment not found or amount mismatch"/></label><button className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700">Reject request</button></form>
        </div>}
      </article>)}
      {!rows.length&&<p className="p-10 text-center text-sm text-slate-400">No crypto payment requests yet.</p>}
    </div>
  </>;
}
