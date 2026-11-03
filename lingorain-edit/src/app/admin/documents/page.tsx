import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherDocuments, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { reviewTeacherDocument } from "@/lib/admin-actions";

export const dynamic = "force-dynamic";
export default async function TeacherDocumentsPage() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const rows = await db.select({ document: teacherDocuments, name: users.name, email: users.email })
    .from(teacherDocuments).innerJoin(users, eq(users.id, teacherDocuments.teacherId))
    .orderBy(desc(teacherDocuments.createdAt)).limit(300);
  return <>
    <h1 className="mb-2 text-3xl font-black text-teal-950">Teacher documents</h1>
    <p className="mb-6 text-sm leading-6 text-slate-500">Verify identity documents and review optional academic or teaching credentials. Only approve after checking the file. Documents are served through an authenticated route from private storage.</p>
    <div className="rounded-3xl border bg-white p-5">
      {rows.length ? rows.map(({ document: d, name, email }) => <article key={d.id} className="border-b py-5 last:border-0">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-teal-950">{d.documentType}{d.optionalCredential ? " · optional credential" : " · identity"}</h2><p className="mt-1 text-sm text-slate-500">{name} · {email}</p><p className="mt-1 text-xs text-slate-400">Submitted {d.createdAt.toLocaleString()} {d.reviewedAt ? `· reviewed ${d.reviewedAt.toLocaleString()}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${d.status === "verified" ? "bg-emerald-50 text-emerald-700" : d.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{d.status}</span></div>
        <a href={`/api/private-files/document/${d.id}`} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="mt-3 inline-flex rounded-lg border px-3 py-2 text-xs font-semibold text-teal-800">Open submitted document ↗</a>
        {d.status === "pending" && <div className="mt-3 flex flex-wrap gap-2">
          <form action={reviewTeacherDocument as unknown as (fd: FormData) => Promise<void>}><input type="hidden" name="id" value={d.id}/><input type="hidden" name="status" value="verified"/><button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Verify document</button></form>
          <form action={reviewTeacherDocument as unknown as (fd: FormData) => Promise<void>}><input type="hidden" name="id" value={d.id}/><input type="hidden" name="status" value="rejected"/><button className="rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-700">Reject document</button></form>
        </div>}
      </article>) : <p className="py-10 text-center text-sm text-slate-400">No documents submitted yet.</p>}
    </div>
  </>;
}
