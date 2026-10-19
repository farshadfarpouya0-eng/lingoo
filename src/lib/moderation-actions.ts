"use server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { lessons, moderationCases, users } from "@/db/schema";
import { getUser, requireAdmin } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";

const clean = (fd: FormData, key: string, max: number) => String(fd.get(key) || "").trim().slice(0, max);
const categories = new Set(["contact_sharing", "harassment", "fraud", "safety", "other"]);

export async function reportParticipant(_previous: unknown, fd: FormData) {
  const user = await getUser();
  if (!user || !["student", "teacher"].includes(user.role)) return { ok: false, error: "Sign in as a class participant." };
  const lessonId = Number(fd.get("lessonId"));
  const subjectUserId = Number(fd.get("subjectUserId"));
  const category = clean(fd, "category", 40);
  const description = clean(fd, "description", 3000);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !Number.isSafeInteger(subjectUserId) || subjectUserId < 1) return { ok: false, error: "Choose a valid lesson and participant." };
  if (subjectUserId === user.id) return { ok: false, error: "You cannot report your own account." };
  if (!categories.has(category) || description.length < 10) return { ok: false, error: "Choose a report reason and describe what happened in at least 10 characters." };
  const [lesson] = await db.select({ id: lessons.id, teacherId: lessons.teacherId }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson || !(await canAccessLesson(lessonId, user.id)) || !(await canAccessLesson(lessonId, subjectUserId))) return { ok: false, error: "Only another participant in this lesson can be reported." };
  const [subject] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, subjectUserId)).limit(1);
  if (!subject || !["student", "teacher"].includes(subject.role)) return { ok: false, error: "Invalid participant." };
  await db.insert(moderationCases).values({ lessonId, reporterId: user.id, subjectUserId, category, description, status: "open" });
  revalidatePath(`/classroom/${lessonId}`); revalidatePath("/admin/moderation"); revalidatePath("/appeals");
  return { ok: true };
}

export async function submitModerationAppeal(fd: FormData) {
  const user = await getUser({ includeSuspended: true });
  if (!user || !["student", "teacher"].includes(user.role)) return { ok: false, error: "Sign in to submit an appeal." };
  const id = Number(fd.get("id"));
  const appealText = clean(fd, "appealText", 4000);
  if (!Number.isSafeInteger(id) || id < 1 || appealText.length < 20) return { ok: false, error: "Write an appeal of at least 20 characters." };
  const [updated] = await db.update(moderationCases).set({ status: "appealed", appealText })
    .where(and(eq(moderationCases.id, id), eq(moderationCases.subjectUserId, user.id), inArray(moderationCases.status, ["resolved", "dismissed"])))
    .returning({ id: moderationCases.id });
  if (!updated) return { ok: false, error: "This case is not currently eligible for an appeal." };
  revalidatePath("/appeals"); revalidatePath("/admin/moderation");
  return { ok: true };
}

export async function reviewModerationCase(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const nextStatus = clean(fd, "status", 30);
  const sanction = clean(fd, "sanction", 30);
  const note = clean(fd, "resolution", 2000);
  if (!Number.isSafeInteger(id) || id < 1 || !["investigating", "resolved", "dismissed"].includes(nextStatus) || !["none", "suspend", "unsuspend"].includes(sanction) || note.length < 4) return { ok: false, error: "Choose a valid decision and provide a review note." };
  try {
    await db.transaction(async tx => {
      const [caseRow] = await tx.select().from(moderationCases).where(eq(moderationCases.id, id)).for("update");
      if (!caseRow) throw new Error("not_found");
      if (sanction !== "none") {
        if (!caseRow.subjectUserId) throw new Error("no_subject");
        const [target] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, caseRow.subjectUserId)).for("update");
        if (!target || !["student", "teacher"].includes(target.role)) throw new Error("invalid_target");
        await tx.update(users).set({ suspended: sanction === "suspend" }).where(eq(users.id, target.id));
      }
      await tx.update(moderationCases).set({ status: nextStatus, resolution: `${sanction === "suspend" ? "Account suspended. " : sanction === "unsuspend" ? "Account reinstated. " : ""}${note}`, resolvedAt: ["resolved", "dismissed"].includes(nextStatus) ? new Date() : null }).where(eq(moderationCases.id, id));
    });
  } catch (e) { return { ok: false, error: e instanceof Error && e.message === "not_found" ? "Case not found." : "The review could not be saved." }; }
  revalidatePath("/admin/moderation"); revalidatePath("/appeals"); revalidatePath("/admin/students"); revalidatePath("/admin/tutors");
  return { ok: true };
}
