import { db } from "@/db";
import { accountingEntries, lessonPackages, lessonParticipants, lessons, referralLessonCredits, siteSettings, teacherProfiles, transactions, users } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { qualifyStudentReferral } from "./referral-service";
import { parseTeacherBonusPolicy, TEACHER_BONUS_SETTING } from "./teacher-bonus-policy";
export const COMMISSION = 0.15;
export const MIN_PAYOUT = 2000;
export const FREE_CANCEL_HOURS = 12;
export const teacherShare = (price: number) => Math.round(price * (1 - COMMISSION));
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function writeAccountingEntries(tx: Tx, transactionId: number, userId: number, amount: number) {
  if (amount === 0) return;
  if (!Number.isSafeInteger(amount)) throw new Error("Ledger amount must be an integer number of cents.");
  const value = Math.abs(amount);
  // Wallet balances are liabilities owed to users. Crediting a wallet credits that
  // liability and debits the clearing account; debiting a wallet does the reverse.
  const walletSide = amount > 0 ? "credit" : "debit";
  const clearingSide = amount > 0 ? "debit" : "credit";
  await tx.insert(accountingEntries).values([
    { transactionId, userId, accountCode: `wallet:${userId}`, side: walletSide, amount: value },
    { transactionId, userId, accountCode: "platform_clearing", side: clearingSide, amount: value },
  ]);
}

export async function ledger(tx: Tx, userId: number, type: string, amount: number, note = "", lessonId?: number, ref?: string) {
  if (!Number.isSafeInteger(amount)) throw new Error("Ledger amount must be an integer number of cents.");
  const [row] = await tx.insert(transactions).values({ userId, type, amount, note, lessonId, ref }).returning({ id: transactions.id });
  if (row) await writeAccountingEntries(tx, row.id, userId, amount);
  return row;
}

/** Insert a uniquely referenced transaction once, and journal it in the same DB transaction. */
export async function ledgerOnce(tx: Tx, userId: number, type: string, amount: number, note: string, ref: string, lessonId?: number) {
  if (!ref.trim()) throw new Error("Idempotent ledger transactions require a reference.");
  if (!Number.isSafeInteger(amount)) throw new Error("Ledger amount must be an integer number of cents.");
  const [row] = await tx.insert(transactions).values({ userId, type, amount, note, lessonId, ref })
    .onConflictDoNothing({ target: transactions.ref }).returning({ id: transactions.id });
  if (!row) return false;
  await writeAccountingEntries(tx, row.id, userId, amount);
  return true;
}
async function teacherPayoutBreakdown(tx: Tx, teacherId: number, gross: number) {
  const base = teacherShare(gross);
  const [policyRow] = await tx.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, TEACHER_BONUS_SETTING)).limit(1);
  const policy = parseTeacherBonusPolicy(policyRow?.value);
  if (!policy.enabled || policy.percent <= 0) return { base, bonus: 0, percent: 0 };
  const [profile] = await tx.select({ rating: teacherProfiles.rating, reviewsCount: teacherProfiles.reviewsCount })
    .from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId)).limit(1);
  if (!profile || Number(profile.rating) < policy.minRating || profile.reviewsCount < policy.minReviews) return { base, bonus: 0, percent: 0 };
  // Standard share is 85%. Bonus is capped so at least 5% of gross remains
  // with the platform before operating costs and taxes.
  const maxBonus = Math.max(0, gross - base - Math.ceil(gross * 0.05));
  const bonus = Math.min(maxBonus, Math.round(gross * policy.percent / 100));
  return { base, bonus, percent: policy.percent };
}

export async function payTeacher(tx: Tx, lessonId: number, teacherId: number, price: number, note: string) {
  const ref = `earning:${lessonId}`;
  const [exists] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (exists) return false;
  const breakdown = await teacherPayoutBreakdown(tx, teacherId, price);
  const total = breakdown.base + breakdown.bonus;
  await tx.update(users).set({ balance: sql`${users.balance} + ${total}` }).where(eq(users.id, teacherId));
  await ledger(tx, teacherId, "earning", breakdown.base, note, lessonId, ref);
  if (breakdown.bonus > 0) await ledger(tx, teacherId, "performance_bonus", breakdown.bonus,
    `Performance bonus (${breakdown.percent}% · rating/review threshold met) · ${note}`, lessonId, `bonus:${lessonId}`);
  await tx.update(teacherProfiles).set({ lessonsCount: sql`${teacherProfiles.lessonsCount} + 1` }).where(eq(teacherProfiles.userId, teacherId));
  return true;
}

/** Pay one semi-private seat exactly once; separate refs allow multiple students per lesson. */
export async function payGroupSeat(tx: Tx, lessonId: number, teacherId: number, studentId: number, paidAmount: number, note: string) {
  const ref = `group-earning:${lessonId}:${studentId}`;
  const [exists] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (exists) return false;
  const breakdown = await teacherPayoutBreakdown(tx, teacherId, paidAmount);
  const total = breakdown.base + breakdown.bonus;
  if (total > 0) await tx.update(users).set({ balance: sql`${users.balance} + ${total}` }).where(eq(users.id, teacherId));
  await ledger(tx, teacherId, "earning", breakdown.base, note, lessonId, ref);
  if (breakdown.bonus > 0) await ledger(tx, teacherId, "performance_bonus", breakdown.bonus,
    `Performance bonus (${breakdown.percent}% · rating/review threshold met) · ${note}`, lessonId, `group-bonus:${lessonId}:${studentId}`);
  return true;
}

/** Restore one cash-funded group seat exactly once. Semi-private seats intentionally do not use packages/trial credits. */
export async function refundGroupSeat(tx: Tx, lessonId: number, studentId: number, amount: number, note: string) {
  const ref = `group-refund:${lessonId}:${studentId}`;
  const [exists] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (exists) return false;
  await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, studentId));
  await ledger(tx, studentId, "refund", amount, note, lessonId, ref);
  return true;
}

export async function refundStudent(tx: Tx, lessonId: number, studentId: number, price: number, note: string, packageId?: number, rewardCreditId?: number) {
  if (rewardCreditId) {
    await tx.update(referralLessonCredits).set({ remainingLessons: sql`${referralLessonCredits.remainingLessons} + 1` })
      .where(and(eq(referralLessonCredits.id, rewardCreditId), eq(referralLessonCredits.userId, studentId)));
    await ledger(tx, studentId, "referral_credit_restore", 0, `Referral lesson credit restored · lesson #${lessonId}`, lessonId, `referral-restore:${lessonId}`);
  } else if (packageId) {
    await tx.update(lessonPackages).set({ remainingLessons: sql`${lessonPackages.remainingLessons} + 1` })
      .where(and(eq(lessonPackages.id, packageId), eq(lessonPackages.studentId, studentId)));
    await ledger(tx, studentId, "package_restore", 0, `1 credit restored · package #${packageId}`, lessonId, `restore:${lessonId}`);
  } else {
    await tx.update(users).set({ balance: sql`${users.balance} + ${price}` }).where(eq(users.id, studentId));
    await ledger(tx, studentId, "refund", price, note, lessonId, `refund:${lessonId}`);
  }
}
/** Settle only eligible lessons; dashboard visits are scoped to the current user. */
export async function settleLessons(actorId?: number) {
  const now = Date.now();
  const due = sql`((${lessons.status} = 'pending' and ${lessons.startAt} < ${new Date(now)}) or (${lessons.status} = 'confirmed' and ${lessons.startAt} + (${lessons.duration} + 360) * interval '1 minute' < ${new Date(now)}))`;
  const owner = actorId ? sql`(${lessons.studentId} = ${actorId} or ${lessons.teacherId} = ${actorId})` : undefined;
  const stale = await db.select().from(lessons).where(and(due, owner)).orderBy(lessons.startAt).limit(100);
  for (const l of stale) {
    if (l.status === "pending") {
      await db.transaction(async tx => {
        const r = await tx.update(lessons).set({ status: "cancelled" }).where(and(eq(lessons.id, l.id), eq(lessons.status, "pending"))).returning({ id: lessons.id });
        if (r.length) await refundStudent(tx, l.id, l.studentId, l.price, "Tutor did not confirm in time", l.packageId ?? undefined, l.rewardCreditId ?? undefined);
      });
    } else if (l.startAt.getTime() + (l.duration + 360) * 60_000 < now) {
      await db.transaction(async tx => {
        const r = await tx.update(lessons).set({ status: "completed" }).where(and(eq(lessons.id, l.id), eq(lessons.status, "confirmed"))).returning({ id: lessons.id });
        if (r.length) {
          if (l.classType === "semi_private") {
            const seats = await tx.select().from(lessonParticipants).where(and(eq(lessonParticipants.lessonId, l.id), inArray(lessonParticipants.status, ["booked", "attended"]))).for("update");
            for (const seat of seats) {
              await payGroupSeat(tx, l.id, l.teacherId, seat.studentId, seat.paidAmount, `Semi-private lesson #${l.id} seat settled`);
              await tx.update(lessonParticipants).set({ status: "attended" }).where(eq(lessonParticipants.id, seat.id));
              if (seat.paidAmount > 0) await qualifyStudentReferral(tx, seat.studentId);
            }
            await tx.update(teacherProfiles).set({ lessonsCount: sql`${teacherProfiles.lessonsCount} + 1` }).where(eq(teacherProfiles.userId, l.teacherId));
          } else {
            await payTeacher(tx, l.id, l.teacherId, l.price, "Lesson auto-completed");
            if (!l.trial && l.price > 0) await qualifyStudentReferral(tx, l.studentId);
          }
        }
      });
    }
  }
}
