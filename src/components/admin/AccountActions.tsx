"use client";

import { useState, useActionState } from "react";
import { adminResetPassword, adminSetRole, adminCreateUser } from "@/lib/account-actions";

const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold";
const input = "rounded-lg border border-slate-200 px-2 py-1.5 text-xs";

export function ResetPassword({ id }: { id: number }) {
  const [state, action, pending] = useActionState(adminResetPassword, {} as { ok?: boolean; error?: string });
  const [pw, setPw] = useState("");

  return (
    <form
      action={action as unknown as (fd: FormData) => Promise<void>}
      onSubmit={() => setPw("")}
      className="flex flex-wrap items-center gap-1.5"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="password"
        type="password"
        value={pw}
        onChange={e => setPw(e.target.value)}
        minLength={8}
        placeholder="New password (min 8)"
        className={`${input} w-44`}
        aria-label="New password"
      />
      <button
        type="submit"
        disabled={pending || pw.length < 8}
        className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50`}
      >
        {pending ? "…" : "Reset password"}
      </button>
      {state.error === "short" && <span role="alert" className="text-[11px] text-red-600">Min 8 characters</span>}
      {state.ok && <span role="status" className="text-[11px] text-emerald-700">Password updated</span>}
    </form>
  );
}

export function ChangeRole({ id, current }: { id: number; current: string }) {
  const [state, action, pending] = useActionState(adminSetRole, {} as { ok?: boolean; error?: string });
  const [role, setRole] = useState(current);

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <select name="role" value={role} onChange={e => setRole(e.target.value)} className={input} aria-label="User role">
        <option value="student">student</option>
        <option value="teacher">teacher</option>
        <option value="admin">admin</option>
      </select>
      <button
        type="submit"
        disabled={pending || role === current}
        className={`${btn} bg-teal-800 text-white hover:bg-teal-900 disabled:opacity-50`}
      >
        {pending ? "…" : "Save role"}
      </button>
      {state.error === "self" && <span role="alert" className="text-[11px] text-red-600">You can&apos;t demote yourself</span>}
      {state.error === "bad_role" && <span role="alert" className="text-[11px] text-red-600">Invalid role</span>}
      {state.ok && <span role="status" className="text-[11px] text-emerald-700">Role saved</span>}
    </form>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(adminCreateUser, {} as { ok?: boolean; error?: string });

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-3xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-teal-950">Create account</h2>
      <p className="mt-1 text-xs text-slate-500">
        Create a student, tutor or <b>admin</b> account with a password.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input name="name" required placeholder="Full name" className={input} />
        <input name="email" type="email" required placeholder="email@example.com" className={input} />
        <input name="password" type="password" required minLength={8} placeholder="Password (min 8)" className={input} />
        <select name="role" defaultValue="student" className={input} aria-label="Role">
          <option value="student">student</option>
          <option value="teacher">teacher</option>
          <option value="admin">admin</option>
        </select>
      </div>

      {state.error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error === "exists"
            ? "This email is already registered."
            : state.error === "short"
              ? "Password must be at least 8 characters."
              : "Please check the fields."}
        </p>
      )}
      {state.ok && <p role="status" className="mt-2 text-xs text-emerald-700">Account created.</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-xl bg-teal-800 px-5 py-2 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}