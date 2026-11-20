"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, lessons, users } from "@/db/schema";
import { getUser } from "./auth";
import { hit } from "./ratelimit";
import {
  CEFR_LEVELS, GOALS, PLACEMENT_QUESTIONS, gradePlacement,
  confirmPlacementTutor, recommendTeachers, type CefrLevel,
} from "./placement";
import { bookLivePlacementAssessment } from "./live-assessment-service";
import { isBookingLeadTimeOpen, zonedLocalToUtc } from "./time";

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const cleanGoal = (g: string) => (GOALS as readonly string[]).includes(g) ? g : "";
const cleanAudience = (a: string) => (a === "kids" ? "kids" : "adults");

/** Written placement test submission (called from the client quiz with plain data). */
export async function submitWrittenAssessment(input: { answers: number[]; goal: string; audience: string }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  if (!await hit(`placement:${user.id}`, 10, 3600_000)) redirect("/assessment?err=rate");

  const answers = input?.answers;
  if (!Array.isArray(answers) || answers.length !== PLACEMENT_QUESTIONS.length ||
    !Array.from(answers).every(v => Number.isInteger(v) && v >= 0 && v < 4)) return { error: "answers" };

  const goal = cleanGoal(String(input?.goal ?? ""));
  const audience = cleanAudience(String(input?.audience ?? "adults"));
  const { score, level } = gradePlacement(answers);
  const matches = await recommendTeachers({ level, goal, audience, nativeLang: user.nativeLang });

  await db.transaction(async tx => {
    // This row also serializes tutor selection and wallet/credit spending.
    await tx.update(users).set({ level }).where(eq(users.id, user.id));
    await tx.insert(assessments).values({
      studentId: user.id, method: "written", status: "completed", goal, audience, score, level, answers,
      recommendedIds: matches.map(m => m.id),
    });
  });
  revalidatePath("/assessment");
  revalidatePath("/dashboard");
  redirect("/assessment/results");
}

/** Books a free live speaking assessment with a randomly selected teacher who is genuinely available. */
export async function requestLiveAssessment(fd: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  if (!await hit(`live-assessment:${user.id}`, 5, 3600_000)) redirect("/assessment?err=rate");

  const goal = cleanGoal(str(fd, "goal", 40));
  const audience = cleanAudience(str(fd, "audience", 10));
  const whenRaw = str(fd, "scheduledAt", 40);
  const [date, time] = whenRaw.split("T");
  const when = date && time ? zonedLocalToUtc(date, time, user.timeZone || "UTC") : null;
  if (!when || !isBookingLeadTimeOpen(when)) redirect("/assessment/live?err=time");

  const booking = await bookLivePlacementAssessment({
    studentId: user.id,
    startAt: when,
    goal,
    audience,
    nativeLang: user.nativeLang,
  });
  if (!booking) redirect("/assessment/live?err=unavailable");

  revalidatePath("/assessment");
  revalidatePath("/dashboard");
  redirect("/assessment?booked=1");
}

/** Teacher submits the student's level after the live assessment call. */
export async function submitLiveEvaluation(fd: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/dashboard");

  const assessmentId = Number(fd.get("assessmentId"));
  const level = str(fd, "level", 4) as CefrLevel;
  const notes = str(fd, "notes", 1000);
  if (!Number.isInteger(assessmentId) || !CEFR_LEVELS.includes(level)) redirect("/dashboard?err=evaluation");

  const [row] = await db.select({ studentId: assessments.studentId, lessonId: assessments.lessonId, goal: assessments.goal, audience: assessments.audience, nativeLang: users.nativeLang })
    .from(assessments).innerJoin(users, eq(users.id, assessments.studentId))
    .where(and(eq(assessments.id, assessmentId), eq(assessments.method, "live"), eq(assessments.status, "scheduled"), eq(assessments.assignedTeacherId, user.id)));
  if (!row?.lessonId) redirect("/dashboard?err=evaluation");
  const lessonId = row.lessonId;
  const matches = await recommendTeachers({ level, goal: row.goal, audience: row.audience, nativeLang: row.nativeLang });
  const saved = await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, row.studentId)).for("update");
    const [held] = await tx.select({ id: lessons.id }).from(lessons)
      .where(and(eq(lessons.id, lessonId), eq(lessons.studentId, row.studentId), eq(lessons.teacherId, user.id), eq(lessons.status, "completed"))).for("share");
    if (!held) return false;
    const [graded] = await tx.update(assessments).set({ status: "completed", level, teacherNotes: notes,
      recommendedIds: matches.map(m => m.id), selectedTeacherId: null, updatedAt: new Date(),
    }).where(and(eq(assessments.id, assessmentId), eq(assessments.assignedTeacherId, user.id), eq(assessments.status, "scheduled"))).returning({ id: assessments.id });
    if (!graded) return false;
    await tx.update(users).set({ level }).where(eq(users.id, row.studentId));
    return true;
  });
  if (!saved) redirect("/dashboard?err=evaluation");
  revalidatePath("/dashboard");
  revalidatePath("/assessment");
  redirect("/dashboard?ok=evaluated");
}

/** Student picks one of the recommended teachers. */
export async function chooseTeacher(fd: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");

  const teacherId = Number(fd.get("teacherId"));
  const assessmentId = Number(fd.get("assessmentId"));
  if (!await confirmPlacementTutor(user.id, assessmentId, teacherId)) redirect("/assessment/results?err=choose");
  revalidatePath("/assessment/results");
  revalidatePath("/assessment");
  revalidatePath("/dashboard");
  redirect(`/teachers/${teacherId}`);
}
