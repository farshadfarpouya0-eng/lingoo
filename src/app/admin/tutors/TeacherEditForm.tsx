"use client";
import { useState, useActionState } from "react";
import Link from "next/link";
import { createTeacher, updateTeacher } from "@/lib/admin-actions";
import type { T } from "@/lib/i18n";
import type { TRow } from "./types";
export type { TRow };
const inp = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function TeacherEditForm({ row, t }: { row: TRow; t: T }) {
  const isCreate = !row.id;
  const [state, action, pending] = useActionState(isCreate ? createTeacher : updateTeacher, { ok: false } as { ok?: boolean; error?: string; id?: number });
  if (isCreate) {
    return (
      <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-teal-950">Add tutor</h2>
        {state?.error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">Please enter a name and a valid email.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-500">{t.name}<input name="name" required maxLength={60} className={inp} /></label>
          <label className="block text-xs font-semibold text-slate-500">{t.email}<input name="email" type="email" required maxLength={254} className={inp} /></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button disabled={pending} className="rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">{pending ? "Adding…" : "Add tutor"}</button>
          <Link href="/admin/tutors" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500">Cancel</Link>
        </div>
      </form>
    );
  }
  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="space-y-5">
      <input type="hidden" name="id" value={row.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-teal-950">Profile</h2>
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-500">{t.name}<input name="name" required maxLength={60} defaultValue={row.name} className={inp} /></label>
            <label className="block text-xs font-semibold text-slate-500">{t.email}<input readOnly value={row.email} className={`${inp} bg-slate-50`} /></label>
            <label className="block text-xs font-semibold text-slate-500">{t.headline}<input name="headline" maxLength={140} defaultValue={row.headline} className={inp} /></label>
            <label className="block text-xs font-semibold text-slate-500">{t.bio}<textarea name="bio" rows={5} maxLength={2000} defaultValue={row.bio} className={inp} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">{t.price} (USD)<input name="price" type="number" min={5} max={500} step={0.5} defaultValue={row.price / 100} className={inp} /></label>
              <label className="block text-xs font-semibold text-slate-500">Rating<input name="rating" type="number" min={0} max={5} step={0.1} defaultValue={row.rating} className={inp} /></label>
              <label className="block text-xs font-semibold text-slate-500">{t.country}<select name="country" defaultValue={row.country} className={inp}>{["US", "GB", "CA", "AU", "IE", "NZ", "ZA", "CN", "JP"].map(c => <option key={c}>{c}</option>)}</select></label>
              <label className="block text-xs font-semibold text-slate-500">{t.accent}<input name="accent" maxLength={40} defaultValue={row.accent} className={inp} /></label>
            </div>
            <label className="block text-xs font-semibold text-slate-500">{t.speaks}<input name="speaks" maxLength={120} defaultValue={row.speaks} className={inp} /></label>
            <label className="block text-xs font-semibold text-slate-500">{t.tags}<input name="tags" maxLength={200} defaultValue={row.tags} className={inp} /></label>
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-teal-950">{t.schedule}</h2>
            <input type="hidden" name="id" value={row.id} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-500">{t.from} (tutor local)<input name="startHour" type="number" min={0} max={23} defaultValue={row.startHour} className={inp} /></label>
              <label className="block text-xs font-semibold text-slate-500">{t.to}<input name="endHour" type="number" min={1} max={24} defaultValue={row.endHour} className={inp} /></label>
              <label className="block text-xs font-semibold text-slate-500 sm:col-span-2">{t.timezone} (UTC offset)<input name="tzOffset" type="number" min={-12} max={14} defaultValue={row.tzOffset} className={inp} /></label>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">{t.workDays}</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d, i) => {
                  const on = row.workDays.split(",").includes(String(i));
                  return (
                    <label key={i} className="cursor-pointer">
                      <input type="checkbox" name="workDays" value={i} defaultChecked={on} className="peer sr-only" />
                      <span className="block rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-semibold peer-checked:border-teal-600 peer-checked:bg-teal-50 peer-checked:text-teal-800">{d}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500"><input type="checkbox" name="certified" defaultChecked={row.certified} className="h-4 w-4 accent-teal-600" />Certified</label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500"><input type="checkbox" name="active" defaultChecked={row.active} className="h-4 w-4 accent-teal-600" />Public</label>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button disabled={pending} className="rounded-xl bg-teal-800 px-6 py-3 font-bold text-white hover:bg-teal-900 disabled:opacity-50">{pending ? "Saving…" : t.save}</button>
            <Link href="/admin/tutors" className="rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-500">Cancel</Link>
          </div>
        </div>
      </div>
    </form>
  );
}
