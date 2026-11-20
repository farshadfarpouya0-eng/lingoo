import { and, eq, inArray, lte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assessments, lessons, lessonParticipants, teacherBlockedSlots,
  teacherProfiles, teacherWeeklySlots, users,
} from "@/db/schema";
import { isAccountSuspended } from "@/lib/account-status";
import { slotIsBookable } from "@/lib/time";

const ACTIVE_LESSONS = ["pending", "confirmed"] as const;
const ACTIVE_SEATS = ["booked", "attended"] as const;

export type LiveAssessmentBookingInput = {
  studentId: number;
  startAt: Date;
  goal: string;
  audience: string;
  nativeLang?: string | null;
};

export type LiveAssessmentBooking = { teacherId: number; lessonId: number; assessmentId: number };

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function supportsLanguage(speaks: string, nativeLang?: string | null) {
  const lang = (nativeLang || "").toLowerCase();
  return (lang === "zh" && /(mandarin|cantonese|chinese)/i.test(speaks))
    || (lang === "ja" && /japanese/i.test(speaks));
}

/**
 * Randomly books an available active teacher for the free 25-minute speaking
 * assessment. Tutors who speak the student's language are tried first; if none
 * can take the requested slot, any available active tutor may be assigned.
 * Slot availability is checked again inside the same transaction that creates
 * the lesson and assessment, under the same tutor advisory lock as normal booking.
 */
export async function bookLivePlacementAssessment(input: LiveAssessmentBookingInput): Promise<LiveAssessmentBooking | null> {
  if (!Number.isSafeInteger(input.studentId) || input.studentId < 1 || !Number.isFinite(input.startAt.getTime())) return null;

  const now = new Date();
  const rows = await db.select({
    id: users.id,
    speaks: teacherProfiles.speaks,
    profile: teacherProfiles,
  }).from(teacherProfiles)
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(and(
      eq(users.role, "teacher"),
      eq(teacherProfiles.active, true),
      or(eq(users.suspended, false), lte(users.suspendedUntil, now))!,
    ));

  const preferred = rows.filter(row => supportsLanguage(row.speaks, input.nativeLang));
  const fallback = rows.filter(row => !supportsLanguage(row.speaks, input.nativeLang));
  const candidates = [...shuffle(preferred), ...shuffle(fallback)];
  if (!candidates.length) return null;

  const endAt = new Date(input.startAt.getTime() + 25 * 60_000);
  for (const candidate of candidates) {
    try {
      const booked = await db.transaction(async tx => {
        // Match reserveLesson lock order: student row first, then tutor slot lock.
        const [student] = await tx.select({ id: users.id, role: users.role, suspended: users.suspended, suspendedUntil: users.suspendedUntil })
          .from(users).where(eq(users.id, input.studentId)).for("update");
        if (!student || student.role !== "student" || isAccountSuspended(student.suspended, student.suspendedUntil)) {
          throw new Error("student_forbidden");
        }
        await tx.execute(sql`select pg_advisory_xact_lock(410000 + ${candidate.id}::bigint)`);

        const [teacher] = await tx.select({ profile: teacherProfiles, suspended: users.suspended, suspendedUntil: users.suspendedUntil })
          .from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId))
          .where(and(
            eq(users.id, candidate.id), eq(users.role, "teacher"), eq(teacherProfiles.active, true),
            or(eq(users.suspended, false), lte(users.suspendedUntil, new Date()))!,
          )).limit(1);
        if (!teacher || isAccountSuspended(teacher.suspended, teacher.suspendedUntil)) throw new Error("slot_unavailable");

        const [weeklySlots, blockedSlots] = await Promise.all([
          tx.select({ weekday: teacherWeeklySlots.weekday, startMinute: teacherWeeklySlots.startMinute, endMinute: teacherWeeklySlots.endMinute })
            .from(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, candidate.id)),
          tx.select({ startAt: teacherBlockedSlots.startAt, endAt: teacherBlockedSlots.endAt })
            .from(teacherBlockedSlots).where(and(
              eq(teacherBlockedSlots.teacherId, candidate.id),
              lt(teacherBlockedSlots.startAt, endAt),
              sql`${teacherBlockedSlots.endAt} > ${input.startAt}`,
            )),
        ]);

        const available = {
          ...teacher.profile,
          weeklySlots: weeklySlots.length ? weeklySlots : null,
          blocked: blockedSlots.map(block => ({ start: block.startAt.getTime(), end: block.endAt.getTime() })),
        };
        if (!slotIsBookable(input.startAt, available, Date.now(), 25)) throw new Error("slot_unavailable");

        const overlap = and(
          inArray(lessons.status, [...ACTIVE_LESSONS]),
          lt(lessons.startAt, endAt),
          sql`${lessons.startAt} + ${lessons.duration} * interval '1 minute' > ${input.startAt}`,
        );
        const [teacherBusy] = await tx.select({ id: lessons.id }).from(lessons)
          .where(and(eq(lessons.teacherId, candidate.id), overlap!)).limit(1);
        if (teacherBusy) throw new Error("slot_unavailable");

        const [studentBusy] = await tx.select({ id: lessons.id }).from(lessons)
          .where(and(eq(lessons.studentId, input.studentId), overlap!)).limit(1);
        if (studentBusy) throw new Error("student_busy");

        // Also prevent overlap with a semi-private lesson where this student is a seat-holder.
        const [studentGroupBusy] = await tx.select({ id: lessonParticipants.id })
          .from(lessonParticipants).innerJoin(lessons, eq(lessons.id, lessonParticipants.lessonId))
          .where(and(
            eq(lessonParticipants.studentId, input.studentId),
            inArray(lessonParticipants.status, [...ACTIVE_SEATS]),
            overlap!,
          )).limit(1);
        if (studentGroupBusy) throw new Error("student_busy");

        const [lesson] = await tx.insert(lessons).values({
          studentId: input.studentId,
          teacherId: candidate.id,
          startAt: input.startAt,
          duration: 25,
          status: "confirmed",
          classType: "private",
          capacity: 1,
          price: 0,
          trial: false,
          placementAssessment: true,
          topic: "Free placement speaking assessment",
          platform: "undecided",
          meetingUrl: "",
        }).returning({ id: lessons.id });

        const [assessment] = await tx.insert(assessments).values({
          studentId: input.studentId,
          method: "live",
          status: "scheduled",
          goal: input.goal,
          audience: input.audience,
          assignedTeacherId: candidate.id,
          scheduledAt: input.startAt,
          lessonId: lesson.id,
        }).returning({ id: assessments.id });

        return { teacherId: candidate.id, lessonId: lesson.id, assessmentId: assessment.id };
      });
      return booked;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "slot_unavailable") continue;
      if (message === "student_busy") return null;
      throw error;
    }
  }

  return null;
}
