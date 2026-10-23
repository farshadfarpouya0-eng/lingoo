import { db } from "@/db";
import { accountingEntries, lessonPackages, lessonParticipants, lessons, referralLessonCredits, siteSettings, teacherProfiles, transactions, users } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { qualifyStudentReferral } from "./referral-service";
import { parseTeacherBonusPolicy, TEACHER_BONUS_SETTING } from "./teacher-bonus-policy";

export const COMMISSION = 0.15;
export const MIN_PAYOUT = 2000;
export const FREE_CANCEL_HOURS = 12;
/** Safety net only: settle a confirmed lesson this long after it ends if nobody marked it. */
export const AUTO_COMPLETE_GRACE_MINUTES = 24 * 60;

export const teacherShare = (price: number) => Math.round(price * (1 - COMMISSION));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Entry = { transactionId: number; userId: number; accountCode: string; side: "debit" | "credit"; amount: number };

/* Settlement throttle: dashboards used to rescan every lesson on every request. */
const SETTLE_INTERVAL_MS = 60_000;
let lastSettleRun = 0;

async function writeAccountingEntries(tx: Tx, transactionId: number, userId: number, amount: number) {
  if (amount === 0) return;
  if (!Number.isSafeInteger(amount)) throw new Error("Ledger amount must be an integer number of cents.");
  const value = Math.abs(amount);
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
  const maxBonus = Math.max(0, gross - base - Math.ceil(gross * 0.05));
  const bonus = Math.min(maxBonus, Math.round(gross * policy.percent / 100));
  return { base, bonus, percent: policy.percent };
}

/**
 * Earning journal (balanced):
 *   wallet:tutor        credit  base
 *   platform_clearing   debit   base
 *   platform_revenue    credit  commission   (gross - base, the full 15%)
 *   platform_clearing   debit   commission
 * Clearing is released by exactly the gross that was escrowed at booking.
 */
function earningEntries(transactionId: number, teacherId: number, gross: number, base: number): Entry[] {
  const out: Entry[] = [];
  if (base > 0) {
    out.push(
      { transactionId, userId: teacherId, accountCode: `wallet:${teacherId}`, side: "credit", amount: base },
      { transactionId, userId: teacherId, accountCode: "platform_clearing", side: "debit", amount: base },
    );
  }
  const commission = gross - base;
  if (commission > 0) {
    out.push(
      { transactionId, userId: teacherId, accountCode: "platform_revenue", side: "credit", amount: commission },
      { transactionId, userId: teacherId, accountCode: "platform_clearing", side: "debit", amount: commission },
    );
  }
  return out;
}

/**
 * Bonus journal (balanced): marketing spend paid into the tutor wallet.
 *   wallet:tutor         credit  bonus
 *   platform_marketing   debit   bonus
 */
function bonusEntries(transactionId: number, teacherId: number, bonus: number): Entry[] {
  if (bonus <= 0) return [];
  return [
    { transactionId, userId: teacherId, accountCode: `wallet:${teacherId}`, side: "credit", amount: bonus },
    { transactionId, userId: teacherId, accountCode: "platform_marketing", side: "debit", amount: bonus },
  ];
}

async function bookEarning(tx: Tx, opts: { teacherId: number; gross: number; lessonId: number; ref: string; bonusRef: string; note: string }) {
  const { teacherId, gross, lessonId, ref, bonusRef, note } = opts;
  const breakdown = await teacherPayoutBreakdown(tx, teacherId, gross);
  const total = breakdown.base + breakdown.bonus;
  if (total > 0) await tx.update(users).set({ balance: sql`${users.balance} + ${total}` }).where(eq(users.id, teacherId));

  const [row] = await tx.insert(transactions)
    .values({ userId: teacherId, type: "earning", amount: breakdown.base, note, lessonId, ref })
    .returning({ id: transactions.id });
  if (row) {
    const entries = earningEntries(row.id, teacherId, gross, breakdown.base);
    if (entries.length) await tx.insert(accountingEntries).values(entries);
  }

  if (breakdown.bonus > 0) {
    const [bonusRow] = await tx.insert(transactions).values({
      userId: teacherId, type: "performance_bonus", amount: breakdown.bonus,
      note: `Performance bonus (${breakdown.percent}% · rating/review threshold met) · ${note}`,
      lessonId, ref: bonusRef,
    }).returning({ id: transactions.id });
    if (bonusRow) await tx.insert(accountingEntries).values(bonusEntries(bonusRow.id, teacherId, breakdown.bonus));
  }
}

export async function payTeacher(tx: Tx, lessonId: number, teacherId: number, price: number, note: string) {
  const ref = `earning:${lessonId}`;
  const [exists] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (exists) return false;
  await bookEarning(tx, { teacherId, gross: price, lessonId, ref, bonusRef: `bonus:${lessonId}`, note });
  await tx.update(teacherProfiles).set({ lessonsCount: sql`${teacherProfiles.lessonsCount} + 1` }).where(eq(teacherProfiles.userId, teacherId));
  return true;
}

/** Pay one semi-private seat exactly once; separate refs allow multiple students per lesson. */
export async function payGroupSeat(tx: Tx, lessonId: number, teacherId: number, studentId: number, paidAmount: number, note: string) {
  const ref = `group-earning:${lessonId}:${studentId}`;
  const [exists] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (exists) return false;
  await bookEarning(tx, { teacherId, gross: paidAmount, lessonId, ref, bonusRef: `group-bonus:${lessonId}:${studentId}`, note });
  return true;
}

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

/**
 * Settle lessons (throttled to once a minute per server process).
 *   1. `pending` lesson whose slot already ended → cancel + refund.
 *   2. `confirmed` lesson that ended > 24h ago and was never marked → auto-complete (safety net).
 * Accepts the old call style `settleLessons(userId)` and `settleLessons({ force: true })`.
 */
export async function settleLessons(arg?: number | { force?: boolean }) {
  const force = typeof arg === "object" && arg !== null && arg.force === true;
  const now = Date.now();
  if (!force && now - lastSettleRun < SETTLE_INTERVAL_MS) return;
  lastSettleRun = now;

  const nowDate = new Date(now);
  const graceCutoff = new Date(now - AUTO_COMPLETE_GRACE_MINUTES * 60_000);

  const due = sql`(
      (${lessons.status} = 'pending'
        and ${lessons.startAt} + ${lessons.duration} * interval '1 minute' < ${nowDate})
    or
      (${lessons.status} = 'confirmed'
        and ${lessons.startAt} + ${lessons.duration} * interval '1 minute' < ${graceCutoff})
  )`;

  const stale = await db.select().from(lessons).where(due).orderBy(lessons.startAt).limit(100);

  for (const l of stale) {
    const endsAt = l.startAt.getTime() + l.duration * 60_000;

    if (l.status === "pending" && endsAt < now) {
      await db.transaction(async tx => {
        const r = await tx.update(lessons).set({ status: "cancelled" })
          .where(and(eq(lessons.id, l.id), eq(lessons.status, "pending")))
          .returning({ id: lessons.id });
        if (r.length) {
          await refundStudent(tx, l.id, l.studentId, l.price,
            "Tutor did not confirm this lesson in time", l.packageId ?? undefined, l.rewardCreditId ?? undefined);
        }
      });
      continue;
    }

    if (l.status === "confirmed" && endsAt < graceCutoff.getTime()) {
      await db.transaction(async tx => {
        const r = await tx.update(lessons).set({ status: "completed" })
          .where(and(eq(lessons.id, l.id), eq(lessons.status, "confirmed")))
          .returning({ id: lessons.id });
        if (!r.length) return;
        if (l.classType === "semi_private") {
          const seats = await tx.select().from(lessonParticipants)
            .where(and(eq(lessonParticipants.lessonId, l.id), inArray(lessonParticipants.status, ["booked", "attended"])))
            .for("update");
          for (const seat of seats) {
            await payGroupSeat(tx, l.id, l.teacherId, seat.studentId, seat.paidAmount, `Semi-private lesson #${l.id} seat settled automatically`);
            await tx.update(lessonParticipants).set({ status: "attended" }).where(eq(lessonParticipants.id, seat.id));
            if (seat.paidAmount > 0) await qualifyStudentReferral(tx, seat.studentId);
          }
          await tx.update(teacherProfiles).set({ lessonsCount: sql`${teacherProfiles.lessonsCount} + 1` })
            .where(eq(teacherProfiles.userId, l.teacherId));
        } else {
          await payTeacher(tx, l.id, l.teacherId, l.price, "Lesson auto-completed (24h safety net)");
          if (!l.trial && l.price > 0) await qualifyStudentReferral(tx, l.studentId);
        }
      });
    }
  }
}
