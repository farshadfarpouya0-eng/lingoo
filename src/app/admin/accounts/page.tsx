import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherProfiles, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { ResetPassword, ChangeRole, CreateUserForm } from "@/components/admin/AccountActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts" };

const roleStyle: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  teacher: "bg-sky-100 text-sky-700",
  student: "bg-slate-100 text-slate-600",
};

export default async function AdminAccounts() {
  const me = await getUser();
  if (!me || me.role !== "admin") redirect("/login");

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      suspended: users.suspended,
      createdAt: users.createdAt,
      tutor: teacherProfiles.userId,
    })
    .from(users)
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(200);

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Admin</p>
        <h1 className="mt-1 text-3xl font-black text-teal-950">Accounts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Change any user's password or role, and create new accounts — including admins.
        </p>
      </div>

      <CreateUserForm />

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-teal-950">All users ({rows.length})</h2>
        <div className="divide-y divide-slate-100">
          {rows.map(u => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 py-4">
              <div className="min-w-[210px] flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {u.name}
                  {u.id === me.id && (
                    <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">you</span>
                  )}
                  {u.suspended && <span className="ml-2 text-xs text-red-500">· suspended</span>}
                </p>
                <p className="truncate text-xs text-slate-400">{u.email}</p>
              </div>

              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleStyle[u.role] ?? "bg-slate-100 text-slate-600"}`}>
                {u.role}
              </span>

              {u.tutor && (
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                  has tutor profile
                </span>
              )}

              <div className="flex w-full flex-wrap items-center gap-3">
                <ChangeRole id={u.id} current={u.role} />
                <ResetPassword id={u.id} />
              </div>
            </div>
          ))}
          {!rows.length && <p className="py-8 text-center text-sm text-slate-400">No users yet.</p>}
        </div>
      </div>
    </>
  );
}