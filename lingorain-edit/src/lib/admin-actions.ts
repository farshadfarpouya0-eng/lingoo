"use server";
import { revalidatePath, updateTag } from "next/cache";
import { decryptPayoutAccount, encryptPayoutAccount } from "./payout-crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { payoutAccountAccessLogs, payouts, teacherProfiles, users, lessons, teacherDocuments, lessonReports, lessonParticipants, adminAuditLogs } from "@/db/schema";
import { requireAdmin } from "./auth";
import { isValidTimeZone } from "./time";
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
  if (!tp) await db.insert(teacherProfiles).values({ userId: u.id, active: fd.get("active") === "on", workDays: "1,2,3,4,5" });
  revalidateAll();
  return { ok: true, id: u.id };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LANGS = ["zh", "ja", "en"];
const intIn = (v: FormDataEntryValue | null, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.max(min, Math.min(max, n)) : fallback;
};
function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return (e?.cause?.code ?? e?.code) === "23505";
}
function isForeignKeyViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return (e?.cause?.code ?? e?.code) === "23503";
}
/** Avatars are an https URL or one of our own /api/avatars/... routes. */
const validAvatar = (v: string) => /^https:\/\/[^\s]+$/.test(v) || /^\/api\/avatars\/\d+$/.test(v);

/** One-click approve / hide for a tutor's public profile (the Activate button in Admin → Tutors). */
export async function setTeacherActive(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id < 1) return;
  const active = fd.get("active") === "1";
  await db.update(teacherProfiles).set({ active }).where(eq(teacherProfiles.userId, id));
  revalidateAll();
  revalidatePath("/admin/tutors");
}

export async function updateTeacher(_p: unknown, fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "id" };
  const [target] = await db.select({ role: users.role, avatar: users.avatar, suspended: users.suspended, suspendedUntil: users.suspendedUntil }).from(users).where(eq(users.id, id));
  if (!target || target.role !== "teacher") return { ok: false, error: "not_found" };

  const name = str(fd, "name", 60);
  if (!name) return { ok: false, error: "name" };
  const email = str(fd, "email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email" };
  const avatar = str(fd, "avatar", 500);
  if (avatar && avatar !== target.avatar && !validAvatar(avatar)) return { ok: false, error: "avatar" };
  const nativeLang = LANGS.includes(str(fd, "nativeLang", 2)) ? str(fd, "nativeLang", 2) : "en";
  const requestedTimeZone = str(fd, "timeZone", 80);
  const timeZone = isValidTimeZone(requestedTimeZone) ? requestedTimeZone : "UTC";
  const startHour = intIn(fd.get("startHour"), 0, 23, 9);
  const endHour = Math.max(startHour + 1, intIn(fd.get("endHour"), 1, 24, 21));
  const rating = Number(fd.get("rating"));
  const payoutAccountInput = str(fd, "payoutAccount", 200);
  if (payoutAccountInput && payoutAccountInput.length < 4) return { ok: false, error: "payout_account" };

  try {
    await db.transaction(async tx => {
      const nextSuspended = fd.get("suspended") === "on";
      const nextSuspendedUntil = nextSuspended && target.suspended ? target.suspendedUntil : null;
      await tx.update(users).set({
        name, email, nativeLang,
        ...(avatar ? { avatar } : {}),
        suspended: nextSuspended,
        suspendedUntil: nextSuspendedUntil,
      }).where(and(eq(users.id, id), eq(users.role, "teacher")));
      if (nextSuspended !== target.suspended || target.suspendedUntil) {
        await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: id, action: nextSuspended ? "account_suspended" : "account_reinstated", reference: `user:${id}`, note: "Account status changed from Admin → Tutors", metadata: { permanent: nextSuspended && !nextSuspendedUntil, suspendedUntil: nextSuspendedUntil?.toISOString() ?? null, previousSuspended: target.suspended, previousSuspendedUntil: target.suspendedUntil?.toISOString() ?? null } });
      }
      await tx.update(teacherProfiles).set({
        headline: str(fd, "headline", 140),
        bio: str(fd, "bio", 4000),
        country: ["US", "GB", "CA", "AU", "IE", "NZ", "ZA", "CN", "JP"].includes(str(fd, "country", 2)) ? str(fd, "country", 2) : "US",
        accent: str(fd, "accent", 40),
        speaks: str(fd, "speaks", 120) || "English",
        tags: str(fd, "tags", 200),
        price: Math.max(0, Math.min(50000, Math.round(Number(fd.get("price") || 25) * 100))),
        rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 5,
        reviewsCount: intIn(fd.get("reviewsCount"), 0, 1_000_000, 0),
        lessonsCount: intIn(fd.get("lessonsCount"), 0, 1_000_000, 0),
        startHour, endHour, timeZone,
        tzOffset: intIn(fd.get("tzOffset"), -12, 14, 0),
        workDays: (fd.getAll("workDays") as unknown as string[]).filter(Boolean).join(",") || "1,2,3,4,5",
        payoutMethod: str(fd, "payoutMethod", 60),
        ...(payoutAccountInput ? { payoutAccount: encryptPayoutAccount(payoutAccountInput) } : {}),
        certified: fd.get("certified") === "on",
        active: fd.get("active") === "on",
      }).where(eq(teacherProfiles.userId, id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "email_taken" };
    throw error;
  }
  revalidateAll();
  revalidatePath("/admin/tutors");
  revalidatePath(`/teachers/${id}`);
  return { ok: true };
}

export async function updateStudent(_p: unknown, fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "id" };
  const [target] = await db.select({ role: users.role, avatar: users.avatar, suspended: users.suspended, suspendedUntil: users.suspendedUntil }).from(users).where(eq(users.id, id));
  if (!target || target.role !== "student") return { ok: false, error: "not_found" };
  const name = str(fd, "name", 60);
  if (!name) return { ok: false, error: "name" };
  const email = str(fd, "email", 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email" };
  const avatar = str(fd, "avatar", 500);
  if (avatar && avatar !== target.avatar && !validAvatar(avatar)) return { ok: false, error: "avatar" };
  const level = str(fd, "level", 2);
  const nativeLang = str(fd, "nativeLang", 2);
  try {
    await db.transaction(async tx => {
      const nextSuspended = fd.get("suspended") === "on";
      const nextSuspendedUntil = nextSuspended && target.suspended ? target.suspendedUntil : null;
      await tx.update(users).set({
        name, email,
        level: LEVELS.includes(level) ? level : "A1",
        nativeLang: LANGS.includes(nativeLang) ? nativeLang : "en",
        ...(avatar ? { avatar } : {}),
        suspended: nextSuspended,
        suspendedUntil: nextSuspendedUntil,
      }).where(and(eq(users.id, id), eq(users.role, "student")));
      if (nextSuspended !== target.suspended || target.suspendedUntil) {
        await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: id, action: nextSuspended ? "account_suspended" : "account_reinstated", reference: `user:${id}`, note: "Account status changed from Admin → Students", metadata: { permanent: nextSuspended && !nextSuspendedUntil, suspendedUntil: nextSuspendedUntil?.toISOString() ?? null, previousSuspended: target.suspended, previousSuspendedUntil: target.suspendedUntil?.toISOString() ?? null } });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "email_taken" };
    throw error;
  }
  revalidateAll();
  revalidatePath("/admin/students");
  return { ok: true };
}

export async function deleteTeacher(_p: unknown, fd: FormData): Promise<{ ok: boolean; error?: string; id?: number }> {
  await requireAdmin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "id" };
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (!u || u.role === "admin") return { ok: false, error: "admin" };
  try {
    // One transaction: if the account is still referenced (lessons, payments) nothing is deleted.
    await db.transaction(async tx => {
      await tx.delete(teacherProfiles).where(eq(teacherProfiles.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, error: "in_use" };
    throw error;
  }
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
  const admin = await requireAdmin();
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
    if (actualDelta) {
      const note = str(fd, "note", 300) || (u.role === "teacher" ? "Admin teacher earnings balance adjustment" : "Admin student wallet adjustment");
      await ledger(tx, id, u.role === "teacher" ? "teacher_balance_adjustment" : "adjustment", actualDelta, note);
      await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: id, action: "balance_adjustment", amount: actualDelta, balanceBefore: current.balance, balanceAfter: updated.balance, reference: `user:${id}`, note, metadata: { role: u.role } });
    }
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
  try { await db.delete(users).where(eq(users.id, id)); }
  catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, error: "in_use" };
    throw error;
  }
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
export async function revealPayoutAccount(payoutId: number): Promise<{ ok: true; account: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!Number.isSafeInteger(payoutId) || payoutId < 1) return { ok: false, error: "invalid" };
  if (!await hit(`payout-account-reveal:${admin.id}`, 20, 60 * 60_000)) return { ok: false, error: "rate" };
  const [row] = await db.select({ id: payouts.id, account: payouts.account, status: payouts.status }).from(payouts).where(eq(payouts.id, payoutId)).limit(1);
  if (!row) return { ok: false, error: "not_found" };
  if (!["pending", "approved", "processing"].includes(row.status)) return { ok: false, error: "not_active" };
  // Every full reveal is recorded. Lists and normal page rendering only receive a mask.
  await db.insert(payoutAccountAccessLogs).values({ adminId: admin.id, payoutId, purpose: "payout_processing" });
  try {
    return { ok: true, account: decryptPayoutAccount(row.account) };
  } catch {
    return { ok: false, error: "key_unavailable" };
  }
}

export async function processPayout(_p: unknown, fd: FormData) {
  const admin = await requireAdmin();
  const id = Number(fd.get("id"));
  const action = String(fd.get("action") ?? "");
  const note = str(fd, "note", 300);
  const providerReference = str(fd, "providerReference", 120);
  if (!Number.isSafeInteger(id) || id < 1 || !["approve", "processing", "paid", "rejected"].includes(action)) return { ok: false, error: "invalid" };
  if (action === "paid" && providerReference.length < 3) return { ok: false, error: "reference_required" };
  let changed = false;
  await db.transaction(async tx => {
    const [p] = await tx.select().from(payouts).where(eq(payouts.id, id)).for("update");
    if (!p) return;
    const from = p.status;
    const allowed = action === "approve" ? from === "pending"
      : action === "processing" ? from === "approved"
      : action === "paid" ? ["approved", "processing"].includes(from)
      : ["pending", "approved", "processing"].includes(from);
    if (!allowed) return;
    const now = new Date();
    const to = action === "approve" ? "approved" : action === "processing" ? "processing" : action;
    const [updated] = await tx.update(payouts).set({
      status: to, reviewedBy: admin.id, reviewedAt: now,
      ...(action === "paid" || action === "rejected" ? { processedAt: now } : {}),
      ...(providerReference ? { providerReference } : {}),
      ...(note ? { note } : {}),
    }).where(and(eq(payouts.id, id), eq(payouts.status, from))).returning({ id: payouts.id });
    if (!updated) return;
    if (action === "rejected") {
      await tx.update(users).set({ balance: sql`${users.balance} + ${p.amount}` }).where(eq(users.id, p.teacherId));
      await ledger(tx, p.teacherId, "payout_refund", p.amount, `Payout #${p.id} rejected`, undefined, `payout-reject:${p.id}`);
    }
    await tx.insert(adminAuditLogs).values({
      adminId: admin.id, targetUserId: p.teacherId, action: `payout_${to}`, amount: p.amount,
      reference: providerReference || `payout:${p.id}`, note,
      metadata: { payoutId: p.id, previousStatus: from, nextStatus: to, method: p.method },
    });
    changed = true;
  });
  if (!changed) return { ok: false, error: "invalid_transition" };
  revalidateAll();
  revalidatePath("/admin/payouts");
  revalidatePath("/dashboard?tab=wallet");
  return { ok: true };
}


/* ------------------------- Verification & support reports ------------------------- */
export async function reviewTeacherDocument(fd: FormData) {
  const admin = await requireAdmin();
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
    const [credential] = await tx.select({ count: sql<number>`count(*)::int` }).from(teacherDocuments)
      .where(and(eq(teacherDocuments.teacherId, reviewed.teacherId), eq(teacherDocuments.optionalCredential, true), eq(teacherDocuments.status, "verified")));
    const credentialVerified = Number(credential?.count || 0) > 0;
    await tx.update(teacherProfiles).set({ credentialVerified })
      .where(eq(teacherProfiles.userId, reviewed.teacherId));
    await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: reviewed.teacherId, action: "teacher_document_review", reference: `teacher_document:${reviewed.id}`, note: `${reviewed.documentType}: ${status}`, metadata: { documentId: reviewed.id, documentType: reviewed.documentType, optionalCredential: reviewed.documentType !== "identity", status, credentialVerified } });
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
