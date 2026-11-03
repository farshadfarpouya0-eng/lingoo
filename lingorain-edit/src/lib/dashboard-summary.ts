import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { teacherShare } from "@/lib/money";

/**
 * Aggregate in PostgreSQL instead of downloading a learner's whole history.
 * Escrow: tutors see their 85% share (bonus not predictable), students see the full amount paid.
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

  return {
    completedLessons: Number(row?.completedLessons || 0),
    completedMinutes: Number(row?.completedMinutes || 0),
    students: Number(row?.students || 0),
    grossCompleted: Number(row?.grossCompleted || 0),
    /* applied exactly once */
    escrow: isTutor ? teacherShare(escrowGross) : escrowGross,
  };
}

export function upcomingForUser(userId: number, isTutor: boolean) {
  return and(
    eq(isTutor ? lessons.teacherId : lessons.studentId, userId),
    inArray(lessons.status, ["pending", "confirmed"]),
  );
}
