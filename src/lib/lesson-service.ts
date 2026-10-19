import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonPackages, lessonParticipants, lessons, referralLessonCredits, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, users } from "@/db/schema";
import { FREE_CANCEL_HOURS, ledger, payGroupSeat, payTeacher, refundGroupSeat, refundStudent } from "./money";
import { slotIsBookable } from "./time";
import { unitLessonPrice } from "./package-pricing";
import { qualifyStudentReferral } from "./referral-service";

export type BookingInput = {
  teacherId: number; startAt: Date; duration: number; trial?: boolean; packageId?: number; topic?: string;
  classType?: "private" | "semi_private"; groupLessonId?: number;
};

const activeSeatStatuses = ["booked", "attended"] as const;
const activeLessonStatuses = ["pending", "confirmed"] as const;

export async function reserveLesson(studentId: number, input: BookingInput) {
  const classType = input.classType === "semi_private" ? "semi_private" : "private";
  if (!Number.isInteger(input.teacherId) || ![25, 50].includes(input.duration) || isNaN(input.startAt.getTime())) throw new Error("slot");
  if (classType === "semi_private" && (input.trial || input.packageId)) throw new Error("group_payment");
  if (input.groupLessonId && classType !== "semi_private") throw new Error("slot");

  return db.transaction(async tx => {
    const [student] = await tx.select().from(users).where(eq(users.id, studentId)).for("update");
    if (!student || student.role !== "student" || student.suspended) throw new Error("forbidden");
    const [tutor] = await tx.select({ p: teacherProfiles }).from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(and(eq(teacherProfiles.userId, input.teacherId), eq(teacherProfiles.active, true), eq(users.suspended, false)));
    const duration = input.trial ? 25 : input.duration;
    const end = new Date(input.startAt.getTime() + duration * 60_000);
    const weekly = await tx.select({ weekday: teacherWeeklySlots.weekday, startMinute: teacherWeeklySlots.startMinute, endMinute: teacherWeeklySlots.endMinute }).from(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, input.teacherId));
    const blocks = await tx.select({ s: teacherBlockedSlots.startAt, e: teacherBlockedSlots.endAt }).from(teacherBlockedSlots).where(and(eq(teacherBlockedSlots.teacherId, input.teacherId), sql`${teacherBlockedSlots.startAt} < ${end}`, sql`${teacherBlockedSlots.endAt} > ${input.startAt}`)).limit(5);
    const avail = tutor ? { ...tutor.p, weeklySlots: weekly.length ? weekly : null, blocked: blocks.map(b => ({ start: b.s.getTime(), end: b.e.getTime() })) } : null;
    if (!tutor || !avail || !slotIsBookable(input.startAt, avail, Date.now(), duration)) throw new Error("slot");

    // Every booking for this teacher takes the same transaction lock; when joining
    // a group, also lock the group row before counting occupied seats.
    await tx.execute(sql`select pg_advisory_xact_lock(410000 + ${input.teacherId}::bigint)`);
    let group = null as typeof lessons.$inferSelect | null;
    if (input.groupLessonId) {
      const [found] = await tx.select().from(lessons).where(eq(lessons.id, input.groupLessonId)).for("update");
      if (!found || found.teacherId !== input.teacherId || found.classType !== "semi_private" ||
        !activeLessonStatuses.includes(found.status as (typeof activeLessonStatuses)[number]) ||
        found.startAt.getTime() !== input.startAt.getTime() || found.duration !== duration || found.capacity < 2 || found.capacity > 4) throw new Error("group_unavailable");
      group = found;
    }

    const enrolled = await tx.select({ lessonId: lessonParticipants.lessonId }).from(lessonParticipants)
      .where(and(eq(lessonParticipants.studentId, studentId), inArray(lessonParticipants.status, [...activeSeatStatuses])));
    const enrolledIds = enrolled.map(x => x.lessonId);
    const studentBusy = enrolledIds.length
      ? or(eq(lessons.studentId, studentId), inArray(lessons.id, enrolledIds))
      : eq(lessons.studentId, studentId);
    const teacherBusy = group
      ? and(eq(lessons.teacherId, input.teacherId), ne(lessons.id, group.id))
      : eq(lessons.teacherId, input.teacherId);
    const [collision] = await tx.select({ id: lessons.id }).from(lessons).where(and(
      or(teacherBusy, studentBusy), ne(lessons.status, "cancelled"),
      sql`${lessons.startAt} < ${end}`, sql`${lessons.startAt} + ${lessons.duration} * interval '1 minute' > ${input.startAt}`,
    )).limit(1);
    if (collision) throw new Error("slot");

    if (input.trial) {
      const [previous] = await tx.select({ id: lessons.id }).from(lessons).where(and(eq(lessons.studentId, studentId), eq(lessons.teacherId, input.teacherId), ne(lessons.status, "cancelled"))).limit(1);
      if (previous || input.packageId) throw new Error("trial");
    }

    // Semi-private classes are paid per seat from the wallet. Packages and trial
    // credits are private-class only so each seat can be refunded/settled atomically.
    let price = Math.round(unitLessonPrice(tutor.p.price, duration as 25 | 50) * (classType === "semi_private" ? 0.75 : 1));
    if (input.trial) price = Math.round(price / 2);
    if (classType === "semi_private") {
      if (student.balance < price) throw new Error("balance");
      const [debited] = await tx.update(users).set({ balance: sql`${users.balance} - ${price}` })
        .where(and(eq(users.id, studentId), sql`${users.balance} >= ${price}`)).returning({ id: users.id });
      if (!debited) throw new Error("balance");
      let lessonId: number;
      if (group) {
        const seats = await tx.select({ id: lessonParticipants.id }).from(lessonParticipants).where(and(
          eq(lessonParticipants.lessonId, group.id), inArray(lessonParticipants.status, [...activeSeatStatuses]),
        )).for("update");
        if (seats.length >= group.capacity) throw new Error("group_full");
        const [duplicate] = await tx.select({ id: lessonParticipants.id }).from(lessonParticipants).where(and(
          eq(lessonParticipants.lessonId, group.id), eq(lessonParticipants.studentId, studentId), inArray(lessonParticipants.status, [...activeSeatStatuses]),
        )).limit(1);
        if (duplicate) throw new Error("group_already_joined");
        await tx.insert(lessonParticipants).values({ lessonId: group.id, studentId, paidAmount: price, status: "booked" });
        lessonId = group.id;
      } else {
        const [created] = await tx.insert(lessons).values({
          studentId, teacherId: input.teacherId, startAt: input.startAt, duration, status: "pending", classType: "semi_private", capacity: 4,
          price, trial: false, topic: (input.topic || "").trim().slice(0, 200), platform: "undecided", meetingUrl: "",
        }).returning({ id: lessons.id });
        lessonId = created.id;
        await tx.insert(lessonParticipants).values({ lessonId, studentId, paidAmount: price, status: "booked" });
      }
      await ledger(tx, studentId, "group_booking", -price, `Semi-private lesson #${lessonId} seat`, lessonId, `group-booking:${lessonId}:${studentId}`);
      return { id: lessonId, classType, price };
    }

    let packageId: number | undefined;
    let rewardCreditId: number | undefined;
    let usedReferralCredit = false;
    if (input.packageId) {
      const [pack] = await tx.select().from(lessonPackages).where(and(eq(lessonPackages.id, input.packageId), eq(lessonPackages.studentId, studentId))).for("update");
      if (!pack || pack.teacherId !== input.teacherId || pack.duration !== duration || pack.remainingLessons < 1) throw new Error("credit");
      await tx.update(lessonPackages).set({ remainingLessons: pack.remainingLessons - 1 }).where(eq(lessonPackages.id, pack.id));
      packageId = pack.id;
      price = pack.unitPrice;
    } else {
      const [credit] = await tx.select().from(referralLessonCredits)
        .where(and(eq(referralLessonCredits.userId, studentId), eq(referralLessonCredits.duration, duration), sql`${referralLessonCredits.remainingLessons} > 0`))
        .orderBy(referralLessonCredits.id).limit(1).for("update");
      if (credit) {
        await tx.update(referralLessonCredits).set({ remainingLessons: credit.remainingLessons - 1 }).where(eq(referralLessonCredits.id, credit.id));
        rewardCreditId = credit.id;
        usedReferralCredit = true;
      } else {
        const [debited] = await tx.update(users).set({ balance: sql`${users.balance} - ${price}` })
          .where(and(eq(users.id, studentId), sql`${users.balance} >= ${price}`)).returning({ id: users.id });
        if (!debited) throw new Error("balance");
      }
    }
    const [lesson] = await tx.insert(lessons).values({
      studentId, teacherId: input.teacherId, startAt: input.startAt, duration, price, trial: !!input.trial,
      packageId, rewardCreditId, classType: "private", capacity: 1, topic: (input.topic || "").trim().slice(0, 200), platform: "undecided", meetingUrl: "",
    }).returning();
    const transactionType = packageId ? "package_booking" : usedReferralCredit ? "referral_credit_booking" : "booking";
    const transactionNote = packageId ? `1 credit used · package #${packageId}` : usedReferralCredit ? `Referral lesson credit used · lesson #${lesson.id}` : `Lesson #${lesson.id}`;
    await ledger(tx, studentId, transactionType, packageId || usedReferralCredit ? 0 : -price, transactionNote, lesson.id);
    return lesson;
  });
}

export async function changeLessonStatus(actorId: number, lessonId: number, action: string, notes = "") {
  return db.transaction(async tx => {
    const [l] = await tx.select().from(lessons).where(eq(lessons.id, lessonId)).for("update");
    if (!l) throw new Error("forbidden");
    const [actor] = await tx.select({ id: users.id, role: users.role, suspended: users.suspended }).from(users).where(eq(users.id, actorId));
    if (!actor || actor.suspended || !["student", "teacher"].includes(actor.role)) throw new Error("forbidden");
    const isTeacher = l.teacherId === actorId && actor.role === "teacher";
    let seat: typeof lessonParticipants.$inferSelect | null = null;
    if (!isTeacher && l.classType === "semi_private" && actor.role === "student") {
      const [foundSeat] = await tx.select().from(lessonParticipants).where(and(
        eq(lessonParticipants.lessonId, l.id), eq(lessonParticipants.studentId, actorId), inArray(lessonParticipants.status, [...activeSeatStatuses]),
      )).for("update");
      seat = foundSeat ?? null;
    }
    const allowedStudent = actor.role === "student" && (l.classType === "semi_private" ? !!seat : l.studentId === actorId);
    if (!isTeacher && !allowedStudent) throw new Error("forbidden");
    const now = Date.now();
    if (!["pending", "confirmed"].includes(l.status)) return false;

    if (action === "cancel") {
      if (l.classType === "semi_private") {
        const seats = await tx.select().from(lessonParticipants).where(and(
          eq(lessonParticipants.lessonId, l.id), inArray(lessonParticipants.status, [...activeSeatStatuses]),
        )).for("update");
        if (isTeacher) {
          await tx.update(lessons).set({ status: "cancelled" }).where(eq(lessons.id, l.id));
          for (const s of seats) {
            await refundGroupSeat(tx, l.id, s.studentId, s.paidAmount, "Teacher cancelled semi-private lesson");
            await tx.update(lessonParticipants).set({ status: "refunded", cancelledAt: new Date() }).where(eq(lessonParticipants.id, s.id));
          }
          return true;
        }
        if (!seat) throw new Error("forbidden");
        const free = l.status === "pending" || l.startAt.getTime() - now >= FREE_CANCEL_HOURS * 3600_000;
        if (free) await refundGroupSeat(tx, l.id, actorId, seat.paidAmount, "Semi-private seat cancelled");
        else await payGroupSeat(tx, l.id, l.teacherId, actorId, seat.paidAmount, "Late semi-private seat cancellation");
        await tx.update(lessonParticipants).set({ status: free ? "refunded" : "cancelled", cancelledAt: new Date() }).where(eq(lessonParticipants.id, seat.id));
        const remaining = seats.filter(s => s.id !== seat!.id);
        if (remaining.length === 0) await tx.update(lessons).set({ status: "cancelled" }).where(eq(lessons.id, l.id));
        return true;
      }
      await tx.update(lessons).set({ status: "cancelled" }).where(eq(lessons.id, l.id));
      const free = isTeacher || l.status === "pending" || l.startAt.getTime() - now >= FREE_CANCEL_HOURS * 3600_000;
      if (free) await refundStudent(tx, l.id, l.studentId, l.price, "Lesson cancelled", l.packageId ?? undefined, l.rewardCreditId ?? undefined);
      else await payTeacher(tx, l.id, l.teacherId, l.price, "Late student cancellation");
      return true;
    }
    if (!isTeacher) throw new Error("forbidden");
    if (action === "confirm" && l.status === "pending" && l.startAt.getTime() > now) {
      await tx.update(lessons).set({ status: "confirmed" }).where(eq(lessons.id, l.id));
      return true;
    }
    if (action === "complete" && l.status === "confirmed" && l.startAt.getTime() + l.duration * 60_000 <= now) {
      await tx.update(lessons).set({ status: "completed", teacherNotes: notes.trim().slice(0, 1000) }).where(eq(lessons.id, l.id));
      if (l.classType === "semi_private") {
        const seats = await tx.select().from(lessonParticipants).where(and(
          eq(lessonParticipants.lessonId, l.id), inArray(lessonParticipants.status, [...activeSeatStatuses]),
        )).for("update");
        for (const s of seats) {
          await payGroupSeat(tx, l.id, l.teacherId, s.studentId, s.paidAmount, `Semi-private lesson #${l.id} completed`);
          await tx.update(lessonParticipants).set({ status: "attended" }).where(eq(lessonParticipants.id, s.id));
          if (s.paidAmount > 0) await qualifyStudentReferral(tx, s.studentId);
        }
        await tx.update(teacherProfiles).set({ lessonsCount: sql`${teacherProfiles.lessonsCount} + 1` }).where(eq(teacherProfiles.userId, l.teacherId));
      } else {
        await payTeacher(tx, l.id, l.teacherId, l.price, `Lesson #${l.id} completed`);
        if (!l.trial && l.price > 0) await qualifyStudentReferral(tx, l.studentId);
      }
      return true;
    }
    return false;
  });
}
