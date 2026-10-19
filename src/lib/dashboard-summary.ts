import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";

/** Aggregate in PostgreSQL instead of downloading a learner's whole history. */
export async function dashboardSummary(userId: number, isTutor: boolean) {
  const otherId = isTutor ? lessons.studentId : lessons.teacherId;
  const [result] = await db.select({
    completedLessons: sql<number>`count(*) filter (where ${lessons.status} = 'completed')::int`,
    completedMinutes: sql<number>`coalesce(sum(${lessons.duration}) filter (where ${lessons.status} = 'completed'),0)::int`,
    students: sql<number>`count(distinct ${otherId})::int`,
    escrow: sql<number>`coalesce(sum(round(${lessons.price} * 0.85)) filter (where ${lessons.status} in ('pending','confirmed')),0)::int`,
  }).from(lessons).where(eq(isTutor ? lessons.teacherId : lessons.studentId, userId));
  return result;
}
export function upcomingForUser(userId: number, isTutor: boolean) {
  return and(eq(isTutor ? lessons.teacherId : lessons.studentId,userId), inArray(lessons.status,["pending","confirmed"]));
}
