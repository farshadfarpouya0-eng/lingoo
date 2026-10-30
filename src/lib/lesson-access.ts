import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessonParticipants, lessons, users } from "@/db/schema";
import { isAccountSuspended } from "@/lib/account-status";

export async function isActiveLessonStudent(lessonId: number, userId: number, primaryStudentId?: number) {
  if (primaryStudentId === userId) {
    const [lesson] = await db.select({ classType: lessons.classType }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (lesson?.classType !== "semi_private") return true;
  }
  const [seat] = await db.select({ id: lessonParticipants.id }).from(lessonParticipants).where(and(
    eq(lessonParticipants.lessonId, lessonId), eq(lessonParticipants.studentId, userId), inArray(lessonParticipants.status, ["booked", "attended"]),
  )).limit(1);
  return !!seat;
}

export async function canAccessLesson(lessonId: number, userId: number) {
  const [caller] = await db.select({ role: users.role, suspended: users.suspended, suspendedUntil: users.suspendedUntil }).from(users).where(eq(users.id, userId)).limit(1);
  if (!caller || isAccountSuspended(caller.suspended, caller.suspendedUntil)) return false;
  if (caller.role === "admin") return true;

  const [lesson] = await db.select({ studentId: lessons.studentId, teacherId: lessons.teacherId, classType: lessons.classType }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return false;
  if (lesson.teacherId === userId) return true;
  if (lesson.classType !== "semi_private") return lesson.studentId === userId;
  return isActiveLessonStudent(lessonId, userId, lesson.studentId);
}

export async function activeLessonStudentIds(lessonId: number, primaryStudentId: number, classType: string) {
  if (classType !== "semi_private") return [primaryStudentId];
  const rows = await db.select({ studentId: lessonParticipants.studentId, status: lessonParticipants.status })
    .from(lessonParticipants).where(eq(lessonParticipants.lessonId, lessonId));
  if (rows.length === 0) return [primaryStudentId];
  return [...new Set(rows.filter(r => r.status === "booked" || r.status === "attended").map(r => r.studentId))];
}
