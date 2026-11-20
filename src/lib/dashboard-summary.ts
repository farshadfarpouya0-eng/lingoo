import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessons, teacherProfiles } from "@/db/schema";
import { getPricingConfig } from "./pricing-config";

/**
 * Aggregate in PostgreSQL instead of downloading a learner's whole history.
 * Escrow: tutors see the sum of their contracted per-lesson fees, students see the full amount paid.
 */
export async function dashboardSummary(userId: number, isTutor: boolean) {
  const otherId = isTutor ? lessons.studentId : lessons.teacherId;
  const filter = isTutor ? eq(lessons.teacherId, userId) : eq(lessons.studentId, userId);

  const [row] = await db.select({
    completedLessons: sql<number>`count(*) filter (where ${lessons.status} = 'completed')::int`,
    completedMinutes: sql<number>`coalesce(sum(${lessons.duration}) filter (where ${lessons.status} = 'completed'),0)::int`,
    students: sql<number>`count(distinct ${otherId})::int`,
    escrowGross: sql<number>`coalesce(sum(${lessons.price}) filter (where ${lessons.status} in ('pending','confirmed')),0)::int`,
    grossCompleted: sql<number>`coalesce(sum(${lessons.price}) filter (where ${lessons.status} = 'completed'),0)::int`,
  }).from(lessons).where(filter);

  const escrowGross = Number(row?.escrowGross || 0);

  // Tutors no longer earn a percentage: escrow is the sum of their contracted
  // per-lesson fees for upcoming lessons. Students still see the full amount paid.
  let escrow = escrowGross;
  if (isTutor) {
    const [cfg, [profile], upcoming] = await Promise.all([
      getPricingConfig(),
      db.select({ fee25: teacherProfiles.fee25, fee50: teacherProfiles.fee50 }).from(teacherProfiles).where(eq(teacherProfiles.userId, userId)),
      db.select({ duration: lessons.duration }).from(lessons)
        .where(and(eq(lessons.teacherId, userId), inArray(lessons.status, ["pending", "confirmed"]))),
    ]);
    const f25 = profile?.fee25 ?? cfg.fee25;
    const f50 = profile?.fee50 ?? cfg.fee50;
    escrow = upcoming.reduce((sum, l) => sum + (l.duration === 25 ? f25 : f50), 0);
  }

  return {
    completedLessons: Number(row?.completedLessons || 0),
    completedMinutes: Number(row?.completedMinutes || 0),
    students: Number(row?.students || 0),
    grossCompleted: Number(row?.grossCompleted || 0),
    escrow,
  };
}

export function upcomingForUser(userId: number, isTutor: boolean) {
  return and(
    eq(isTutor ? lessons.teacherId : lessons.studentId, userId),
    inArray(lessons.status, ["pending", "confirmed"]),
  );
}
