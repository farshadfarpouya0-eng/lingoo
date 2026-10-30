"use client";
import { useActionState } from "react";
import Link from "next/link";
import { updateTeacher } from "@/lib/admin-actions";
import type { T } from "@/lib/i18n";
import type { TRow } from "./types";
import { COMMON_TIME_ZONES } from "@/lib/time";
export type { TRow };
const inp = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const lab = "block text-xs font-semibold text-slate-500";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ERRORS: Record<string, string> = {
  id: "Invalid tutor.", not_found: "This tutor no longer exists.", name: "Please enter a name.",
  email: "Please enter a valid email address.", email_taken: "Another account already uses this email.",
  avatar: "The photo must be an https:// link.", payout_account: "A payout account must contain at least 4 characters.",
};
const ID_LABEL = { verified: "ID verified", pending: "ID uploaded — waiting for review", rejected: "ID rejected", none: "No ID uploaded yet" } as const;

export default function TeacherEditForm({ row, t }: { row: TRow; t: T }) {
  const [state, action, pending] = useActionState(updateTeacher, { ok: false } as { ok: boolean; error?: string });
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="space-y-5">
      <input type="hidden" name="id" value={row.id} />
      {state.ok && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Saved.</p>}
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{ERRORS[state.error] ?? "Could not save."}</p>}

      <div className="rounded-3xl border border-teal-200 bg-teal-50 p-5">
        <h2 className="text-lg font-bold text-teal-950">Approval</h2>
        <p className="mt-1 text-xs text-slate-600">New tutors stay hidden until you approve them here. Uploading or verifying documents does <b>not</b> approve a tutor automatically.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-teal-950"><input type="checkbox" name="active" defaultChecked={row.active} className="h-5 w-5 accent-teal-600" />Active — visible to students and bookable</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="certified" defaultChecked={row.certified} className="h-4 w-4 accent-teal-600" />Certified badge</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-red-700"><input type="checkbox" name="suspended" defaultChecked={row.suspended} className="h-4 w-4 accent-red-600" />Suspended (cannot sign in)</label>
        </div>
        <p className="mt-3 text-xs text-slate-600">Documents: <b>{ID_LABEL[row.idStatus]}</b> · <Link href="/admin/documents" className="font-semibold text-teal-700 underline">Review documents</Link> · <Link href="/admin/accounts" className="font-semibold text-teal-700 underline">Reset password</Link></p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-teal-950">Profile</h2>
          <div className="space-y-3">
            <label className={lab}>{t.name}<input name="name" required maxLength={60} defaultValue={row.name} className={inp} /></label>
            <label className={lab}>{t.email}<input name="email" type="email" required maxLength={254} defaultValue={row.email} className={inp} /></label>
            <label className={lab}>Photo link (https://…)<input name="avatar" maxLength={500} defaultValue={row.avatar} className={inp} /></label>
            <label className={lab}>{t.nativeLang}<select name="nativeLang" defaultValue={row.nativeLang} className={inp}><option value="en">English</option><option value="zh">中文</option><option value="ja">日本語</option></select></label>
            <label className={lab}>{t.headline}<input name="headline" maxLength={140} defaultValue={row.headline} className={inp} /></label>
            <label className={lab}>{t.bio}<textarea name="bio" rows={5} maxLength={4000} defaultValue={row.bio} className={inp} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className={lab}>{t.price} (USD)<input name="price" type="number" min={0} max={500} step={0.5} defaultValue={row.price / 100} className={inp} /></label>
              <label className={lab}>Rating<input name="rating" type="number" min={0} max={5} step={0.1} defaultValue={row.rating} className={inp} /></label>
              <label className={lab}>Reviews count<input name="reviewsCount" type="number" min={0} defaultValue={row.reviewsCount} className={inp} /></label>
              <label className={lab}>Lessons taught<input name="lessonsCount" type="number" min={0} defaultValue={row.lessonsCount} className={inp} /></label>
              <label className={lab}>{t.country}<select name="country" defaultValue={row.country} className={inp}>{["US", "GB", "CA", "AU", "IE", "NZ", "ZA", "CN", "JP"].map(c => <option key={c}>{c}</option>)}</select></label>
              <label className={lab}>{t.accent}<input name="accent" maxLength={40} defaultValue={row.accent} className={inp} /></label>
            </div>
            <label className={lab}>{t.speaks}<input name="speaks" maxLength={120} defaultValue={row.speaks} className={inp} /></label>
            <label className={lab}>{t.tags}<input name="tags" maxLength={200} defaultValue={row.tags} className={inp} /></label>
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-teal-950">{t.schedule}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className={lab}>{t.from} (tutor local)<input name="startHour" type="number" min={0} max={23} defaultValue={row.startHour} className={inp} /></label>
              <label className={lab}>{t.to}<input name="endHour" type="number" min={1} max={24} defaultValue={row.endHour} className={inp} /></label>
              <label className={`${lab} col-span-2`}>Time zone (IANA)<select name="timeZone" defaultValue={row.timeZone || "UTC"} className={inp}>{COMMON_TIME_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
              <input type="hidden" name="tzOffset" value={row.tzOffset} />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">{t.workDays}</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => (
                  <label key={i} className="cursor-pointer">
                    <input type="checkbox" name="workDays" value={i} defaultChecked={row.workDays.split(",").includes(String(i))} className="peer sr-only" />
                    <span className="block rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-semibold peer-checked:border-teal-600 peer-checked:bg-teal-50 peer-checked:text-teal-800">{d}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <h2 className="mb-1 text-lg font-bold text-teal-950">Payout details</h2>
            <p className="mb-3 text-xs text-slate-500">Earnings balance: <b>${(row.balance / 100).toFixed(2)}</b> (adjust it from the Tutors list).</p>
            <div className="grid gap-3">
              <label className={lab}>Payout method<input name="payoutMethod" maxLength={60} defaultValue={row.payoutMethod} className={inp} /></label>
              <label className={lab}>Replace payout account<input name="payoutAccount" minLength={4} maxLength={200} autoComplete="off" placeholder="Leave blank to keep saved details" className={inp} /></label>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={pending} className="rounded-xl bg-teal-800 px-6 py-3 font-bold text-white hover:bg-teal-900 disabled:opacity-50">{pending ? "Saving…" : t.save}</button>
            <Link href="/admin/tutors" className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-500">Back to tutors</Link>
          </div>
        </div>
      </div>
    </form>
  );
}
