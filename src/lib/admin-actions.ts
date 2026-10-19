"use server";
import { revalidatePath, updateTag } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { payouts, teacherProfiles, users, lessons, teacherDocuments, lessonReports, lessonParticipants } from "@/db/schema";
import { requireAdmin } from "./auth";
import { hit } from "./ratelimit";
import { PUBLIC_TUTORS_TAG } from "./public-tutors";
import { refundStudent, refundGroupSeat, ledger } from "./money";
import {
  saveContentAndSettings, resetContent as resetContentFn,
  type HomeContent, type Settings, type Lang,
} from "./site-content";

const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
const revalidateAll = () => { revalidatePath("/", "layout"); revalidatePath("/teachers"); revalidatePath("/dashboard"); revalidatePath("/admin"); revalidatePath("/admin/*"); updateTag(PUBLIC_TUTORS_TAG); };

/* ------------------------- Site content & settings ------------------------- */
export async function saveSiteContentAndSettings(_p: unknown, fd: FormData) {
  await requireAdmin();
  const lang = (["en", "zh", "ja"].includes(String(fd.get("lang"))) ? String(fd.get("lang")) : "en") as Lang;
  const content = fd.get("content") ? (JSON.parse(String(fd.get("content"))) as HomeContent) : null;
  const settings: Settings = JSON.parse(String(fd.get("settings") || "{}"));
  if (content) await saveContentAndSettings(lang, content, settings);
  revalidateAll();
  return { ok: true };
}
export async function resetContent(_p: unknown, fd: FormData) {
  await requireAdmin();
  const lang = (["en", "zh", "ja"].includes(String(fd.get("lang"))) ? String(fd.get("lang")) : "en") as Lang;
  await resetContentFn(lang);
  revalidateAll();
  return { ok: true };
}

/* ------------------------- Teachers ------------------------- */
export async function createTeacher(_p: unknown, fd: FormData): Promise<{ ok: boolean; error?: string; id?: number }> {
  await requireAdmin();
  const name = str(fd, "name", 60);
  const email = str(fd, "email", 254).toLowerCase();
  if (!name || !email) return { ok: false, error: "name_email" };
  const [u] = await db.insert(users).values({
    name, email, passwordHash: "", role: "teacher", avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}`, nativeLang: "en",
  }).returning().catch(() => [null as (typeof users.$inferSelect | null)]);
  if (!u) return { ok: false, error: "email" };
  const [tp] = await db.select({ id: teacherProfiles.userId }).from(teacherProfiles).where(eq(teacherProfiles.userId, u.id));
  if (!tp) await db.insert(teacherProfiles).values({ userId: u.id, active: false, workDays: "1,2,3,4,5" });
  revalidateAll();
  return { ok: true, id: u.id };
}

export async function updateTeacher(_p: unknown, fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "id" };
  const name = str(fd, "name", 60);
  const avatar = str(fd, "avatar", 500);
  await db.update(users).set({
    ...(name ? { name } : {}),
    ...(avatar ? { avatar } : {}),
  }).where(and(eq(users.id, id), sql`${users.role} <> 'admin'`));
  await db.update(teacherProfiles).set({
    headline: str(fd, "headline", 140),
    bio: str(fd, "bio", 4000),
    country: ["US", "GB", "CA", "AU", "IE", "NZ", "ZA", "CN", "JP"].includes(str(fd, "country", 2)) ? str(fd, "country", 2) : "US",
    accent: str(fd, "accent", 40),
    speaks: str(fd, "speaks", 120) || "English",
    tags: str(fd, "tags", 200),
    price: Math.max(0, Math.min(50000, Math.round(Number(fd.get("price") || 25) * 100))),
    rating: Math.min(5, Math.max(0, Number(fd.get("rating") || 5))),
    startHour: Math.max(0, Math.min(23, Number(fd.get("startHour") || 9))),
    endHour: Math.max(1, Math.min(24, Number(fd.get("endHour") || 21))),
    tzOffset: Math.max(-12, Math.min(14, Number(fd.get("tzOffset") || 0))),
    workDays: (fd.getAll("workDays") as unknown as string[]).filter(Boolean).join(",") || "1,2,3,4,5",
    certified: fd.get("certified") === "on",
    active: fd.get("active") === "on",
  }).where(eq(teacherProfiles.userId, id));
  revalidateAll();
  return { ok: true };
}

export async function deleteTeacher(_p: unknown, fd: FormData): Promise<{ ok: boolean; error?: string; id?: number }> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "id" };
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!u || u.role === "admin") return { ok: false, error: "admin" };
  await db.delete(teacherProfiles).where(eq(teacherProfiles.userId, id));
  await db.delete(users).where(eq(users.id, id));
  revalidateAll();
  return { ok: true };
}

export async function saveTeacherSchedule(_p: unknown, fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "id" };
  const startHour = Math.max(0, Math.min(23, Number(fd.get("startHour") || 9)));
  const endHour = Math.max(startHour + 1, Math.min(24, Number(fd.get("endHour") || 21)));
  const tzOffset = Math.max(-12, Math.min(14, Number(fd.get("tzOffset") || 0)));
  const workDays = (fd.getAll("workDays") as unknown as string[]).filter(Boolean).join(",") || "1,2,3,4,5";
  await db.update(teacherProfiles).set({ startHour, endHour, tzOffset, workDays }).where(eq(teacherProfiles.userId, id));
  revalidateAll();
  return { ok: true };
}

/* ------------------------- Students ------------------------- */
export async function adjustStudentBalance(_p: unknown, fd: FormData): Promise<{ ok: boolean; error?: string; balance?: number }> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const rawDelta = Number(fd.get("delta"));
  const delta = Math.round(rawDelta * 100);
  if (!Number.isInteger(id) || !Number.isFinite(rawDelta) || !Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 100_000_000) return { ok: false, error: "amount" };
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!u || !["student", "teacher"].includes(u.role)) return { ok: false, error: "not_eligible" };
  let newBal = 0;
  await db.transaction(async tx => {
    const [current] = await tx.select({ balance: users.balance }).from(users).where(and(eq(users.id, id), sql`${users.role} in ('student', 'teacher')`)).for("update");
    if (!current) throw new Error("not_eligible");
    const next = Math.max(0, current.balance + delta);
    const actualDelta = next - current.balance;
    const [updated] = await tx.update(users).set({ balance: next }).where(eq(users.id, id)).returning({ balance: users.balance });
    newBal = updated.balance;
    if (actualDelta) await ledger(tx, id, u.role === "teacher" ? "teacher_balance_adjustment" : "adjustment", actualDelta,
      str(fd, "note", 300) || (u.role === "teacher" ? "Admin teacher earnings balance adjustment" : "Admin student wallet adjustment"));
  });
  revalidateAll();
  return { ok: true, error: "", balance: newBal };
}

export async function deleteStudent(_p: unknown, fd: FormData): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "id" };
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!u || u.role === "admin") return { ok: false, error: "admin" };
  await db.delete(users).where(eq(users.id, id));
  revalidateAll();
  return { ok: true };
}

/* ------------------------- Lessons ------------------------- */
export async function cancelLesson(_p: unknown, fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { error: "id" };
  await db.transaction(async (tx) => {
    const [l] = await tx.select().from(lessons).where(eq(lessons.id, id)).for("update");
    if (!l || !["confirmed", "pending"].includes(l.status)) return;
    await tx.update(lessons).set({ status: "cancelled" }).where(eq(lessons.id, id));
    if (l.classType === "semi_private") {
      const seats = await tx.select().from(lessonParticipants).where(and(eq(lessonParticipants.lessonId, id), inArray(lessonParticipants.status, ["booked", "attended"]))).for("update");
      for (const seat of seats) {
        await refundGroupSeat(tx, id, seat.studentId, seat.paidAmount, "Admin cancelled semi-private lesson");
        await tx.update(lessonParticipants).set({ status: "refunded", cancelledAt: new Date() }).where(eq(lessonParticipants.id, seat.id));
      }
    } else {
      // Restore the same funding source: package credit, referral credit or wallet.
      await refundStudent(tx, l.id, l.studentId, l.price, "Admin cancel", l.packageId ?? undefined, l.rewardCreditId ?? undefined);
    }
  });
  revalidateAll();
  return { ok: true };
}
function inArrayStatus(list: string[]) {
  return sql`${lessons.status} in (${sql.join(list.map(s => sql`${s}`), sql`, `)})`;
}

/* ------------------------- Payouts ------------------------- */
export async function processPayout(_p: unknown, fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const action = String(fd.get("action"));
  if (!Number.isInteger(id) || (action !== "paid" && action !== "rejected")) return { error: "id" };
  await db.transaction(async (tx) => {
    const [p] = await tx.update(payouts)
      .set({ status: action === "paid" ? "paid" : "rejected", processedAt: new Date(), note: str(fd, "note", 300) })
      .where(and(eq(payouts.id, id), eq(payouts.status, "pending")))
      .returning();
    if (p && action === "rejected") {
      await tx.update(users).set({ balance: sql`${users.balance} + ${p.amount}` }).where(eq(users.id, p.teacherId));
      await ledger(tx, p.teacherId, "payout_refund", p.amount, `Payout #${p.id} rejected`, undefined, `payout-reject:${p.id}`);
    }
  });
  revalidateAll();
  return { ok: true };
}


/* ------------------------- Verification & support reports ------------------------- */
export async function reviewTeacherDocument(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const status = str(fd, "status", 20);
  if (!Number.isSafeInteger(id) || id < 1 || !["verified", "rejected"].includes(status)) return { ok: false, error: "invalid" };
  const doc = await db.transaction(async tx => {
    const [reviewed] = await tx.update(teacherDocuments).set({ status, reviewedAt: new Date() })
      .where(and(eq(teacherDocuments.id, id), eq(teacherDocuments.status, "pending")))
      .returning({ id: teacherDocuments.id, teacherId: teacherDocuments.teacherId, documentType: teacherDocuments.documentType });
    if (!reviewed) return null;
    if (reviewed.documentType === "identity") {
      const [verified] = await tx.select({ count: sql<number>`count(*)::int` }).from(teacherDocuments)
        .where(and(eq(teacherDocuments.teacherId, reviewed.teacherId), eq(teacherDocuments.documentType, "identity"), eq(teacherDocuments.status, "verified")));
      await tx.update(teacherProfiles).set({ certified: Number(verified?.count || 0) > 0 })
        .where(eq(teacherProfiles.userId, reviewed.teacherId));
    }
    return reviewed;
  });
  if (!doc) return { ok: false, error: "already_reviewed" };
  revalidatePath("/admin/documents");
  revalidatePath("/dashboard?tab=profile");
  revalidatePath(`/teachers/${doc.teacherId}`);
  revalidateAll();
  return { ok: true };
}

export async function resolveLessonReport(fd: FormData) {
  await requireAdmin();
  const id = Number(fd.get("id"));
  const status = str(fd, "status", 20);
  const resolution = str(fd, "resolution", 1000);
  if (!Number.isSafeInteger(id) || id < 1 || !["investigating", "resolved", "dismissed"].includes(status)) return { ok: false, error: "invalid" };
  const [row] = await db.update(lessonReports).set({ status, resolution })
    .where(eq(lessonReports.id, id)).returning({ id: lessonReports.id });
  if (!row) return { ok: false, error: "not_found" };
  revalidatePath("/admin/reports");
  return { ok: true };
}
