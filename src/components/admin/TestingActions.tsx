"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTestLesson, testLessonStartNow, testLessonDelay,
  testLessonEndNow, testLessonDelete, switchToUser, switchBackToAdmin,
} from "@/lib/testing-actions";

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
const input = "rounded-lg border border-slate-200 px-3 py-2 text-xs";
type R = { ok?: boolean; error?: string; id?: number };

export function CreateTestLesson({
  students, tutors,
}: {
  students: { id: number; name: string; email: string }[];
  tutors: { id: number; name: string; email: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: R, fd: FormData) => {
    const r = await createTestLesson(prev, fd);
    if (r.ok) setTimeout(() => router.refresh(), 300);
    return r;
  }, {} as R);

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-3xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-teal-950">Create a test lesson</h2>
      <p className="mt-1 text-xs text-slate-500">
        Creates a sandbox lesson instantly — no payment, no booking flow. Perfect for testing the classroom.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-[11px] font-bold text-slate-500">
          Student
          <select name="studentId" className={`${input} mt-1 w-full`} required>
            {students.map(s => <option key={s.id} value={s.id}>{s.name} · #{s.id}</option>)}
          </select>
        </label>

        <label className="text-[11px] font-bold text-slate-500">
          Tutor
          <select name="teacherId" className={`${input} mt-1 w-full`} required>
            {tutors.map(t => <option key={t.id} value={t.id}>{t.name} · #{t.id}</option>)}
          </select>
        </label>

        <label className="text-[11px] font-bold text-slate-500">
          Length
          <select name="duration" className={`${input} mt-1 w-full`} defaultValue="60">
            <option value="25">25 min</option>
            <option value="50">50 min</option>
            <option value="60">60 min</option>
            <option value="90">90 min</option>
          </select>
        </label>

        <label className="text-[11px] font-bold text-slate-500">
          Classroom
          <select name="platform" className={`${input} mt-1 w-full`} defaultValue="lingo">
            <option value="lingo">Lingo Room</option>
            <option value="meet">Google Meet</option>
            <option value="zoom">Zoom</option>
            <option value="daily">Daily</option>
          </select>
        </label>

        <label className="text-[11px] font-bold text-slate-500">
          Start
          <select name="timing" className={`${input} mt-1 w-full`} defaultValue="now">
            <option value="now">Now (room opens immediately)</option>
            <option value="in2h">In 2 hours (room closed)</option>
            <option value="tomorrow">Tomorrow (room closed)</option>
          </select>
        </label>
      </div>

      {state.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">Could not create the lesson. Check the selected users.</p>}
      {state.ok && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">Test lesson #{state.id} created.</p>}

      <button disabled={pending} className="mt-4 rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
        {pending ? "Creating…" : "Create test lesson"}
      </button>
    </form>
  );
}

function Mini({ fn, label, tone = "slate", extra, confirmText }: {
  fn: (prev: R, fd: FormData) => Promise<R>;
  label: string;
  tone?: "slate" | "amber" | "red" | "teal";
  extra?: { name: string; value: string }[];
  confirmText?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: R, fd: FormData) => {
    const r = await fn(prev, fd);
    setTimeout(() => router.refresh(), 250);
    return r;
  }, {} as R);

  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    amber: "bg-amber-100 text-amber-800 hover:bg-amber-200",
    red: "bg-red-50 text-red-600 hover:bg-red-100",
    teal: "bg-teal-800 text-white hover:bg-teal-900",
  };

  return (
    <form
      action={action as unknown as (fd: FormData) => Promise<void>}
      onSubmit={e => { if (confirmText && !confirm(confirmText)) e.preventDefault(); }}
      className="inline-flex"
    >
      {extra?.map(x => <input key={x.name} type="hidden" name={x.name} value={x.value} />)}
      <button disabled={pending} className={`${btn} ${tones[tone]}`}>{pending ? "…" : label}</button>
    </form>
  );
}

export function TestLessonActions({ id }: { id: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Mini fn={switchToUser} label="Open as student" tone="teal" extra={[{ name: "id", value: "" }]} />
    </div>
  );
}

export function TestLessonControls({ id, studentId }: { id: number; studentId: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Mini fn={switchToUser} label="Open as student" tone="teal" extra={[{ name: "id", value: String(studentId) }]} />
      <Mini fn={testLessonStartNow} label="Start now" tone="slate" extra={[{ name: "id", value: String(id) }]} />
      <Mini fn={testLessonDelay} label="+30 min" tone="slate" extra={[{ name: "id", value: String(id) }, { name: "minutes", value: "30" }]} />
      <Mini fn={testLessonEndNow} label="End now" tone="amber" extra={[{ name: "id", value: String(id) }]} />
      <Mini fn={testLessonDelete} label="Delete" tone="red" extra={[{ name: "id", value: String(id) }]} confirmText="Delete this test lesson?" />
    </div>
  );
}

export function SwitchUserButtons({ id, label }: { id: number; label: string }) {
  return <Mini fn={switchToUser} label={label} tone="teal" extra={[{ name: "id", value: String(id) }]} />;
}

export function BackToAdminButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => { await switchBackToAdmin(); router.push("/admin/testing"); router.refresh(); }}
      className={`${btn} bg-amber-400 text-teal-950 hover:bg-amber-300`}
    >
      ← Back to admin
    </button>
  );
}