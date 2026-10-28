import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { updateMaterialStatus } from "@/lib/feature-actions";
import MaterialUploadForm from "@/components/MaterialUploadForm";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
// File verification and Neon writes can take longer on serverless deployments.
export const maxDuration = 60;

async function deleteMaterial(fd: FormData) {
  "use server";
  const user = await getUser();
  if (!user || user.role !== "admin") return;
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(learningMaterials).where(eq(learningMaterials.id, id));
  revalidatePath("/admin/materials");
  revalidatePath("/dashboard");
}

function summarizeCourse(fileUrl: string) {
  try {
    if (fileUrl && fileUrl.trim().startsWith("{")) {
      const parsed = JSON.parse(fileUrl);
      const count = Array.isArray(parsed.units) ? parsed.units.length : 1;
      const audioCount = Array.isArray(parsed.units) ? parsed.units.filter((u: any) => !!(u?.audioRef || u?.audioUrl)).length : 0;
      const mode = parsed.mode === "self" ? "Self-Study" : parsed.mode === "tutor" ? "Tutor-Led" : "Self-Study + Tutor";
      return `${count} lesson${count === 1 ? "" : "s"} · ${audioCount} audio track${audioCount === 1 ? "" : "s"} · ${mode}`;
    }
  } catch {}
  return "1 lesson · Standard resource";
}

export default async function AdminMaterials() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const rows = await db.select().from(learningMaterials).orderBy(desc(learningMaterials.createdAt)).limit(200);

  return (
    <>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Learning library · Neon DB</p>
        <h1 className="mt-1 text-3xl font-black text-teal-950">Textbooks &amp; Audio Courses</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create interactive textbooks with audio and images. Lesson metadata is stored in Neon; media files are kept in private storage and served only to authorized users.
        </p>
      </div>

      <MaterialUploadForm />

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-bold text-teal-950">Existing courses ({rows.length})</h2>
        <div className="divide-y divide-slate-100">
          {rows.map(m => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 py-4">
              {m.coverUrl && (
                <img src={m.coverUrl?.startsWith("storage://") ? `/api/private-files/material/${m.id}/asset?asset=cover` : m.coverUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-slate-200" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{m.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {m.kind} · {m.language} · {m.level} · {m.isFree ? "Free" : `Paid · $${(m.price / 100).toFixed(2)}`} · {m.published ? "Published" : "Draft"}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-teal-700">{summarizeCourse(m.fileUrl)}</p>
              </div>

              <form action={updateMaterialStatus as unknown as (fd: FormData) => Promise<void>} className="flex items-center gap-2">
                <input type="hidden" name="id" value={m.id} />
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <input type="checkbox" name="published" defaultChecked={m.published} className="accent-teal-700" /> Published
                </label>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Save status
                </button>
              </form>

              <form action={deleteMaterial}>
                <input type="hidden" name="id" value={m.id} />
                <button className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100">
                  Delete
                </button>
              </form>
            </div>
          ))}
          {!rows.length && <p className="py-6 text-center text-sm text-slate-400">No courses created yet.</p>}
        </div>
      </section>
    </>
  );
}
