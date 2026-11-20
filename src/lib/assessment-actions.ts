"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, users } from "@/db/schema";
import { getUser } from "./auth";
import { hit } from "./ratelimit";
import {
  CEFR_LEVELS, GOALS, PLACEMENT_QUESTIONS, gradePlacement,
  recommendTeachers, type CefrLevel,
} from "./placement";
import { bookLivePlacementAssessment } from "./live-assessment-service";
import { isBookingLeadTimeOpen, zonedLocalToUtc } from "./time";

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const cleanGoal = (g: string) => (GOALS as readonly string[]).includes(g) ? g : "";
const cleanAudience = (a: string) => (a === "kids" ? "kids" : "adults");

async function latestAssessment(studentId: number) {
  const [row] = await db.select().from(assessments)
    .where(eq(assessments.studentId, studentId))
    .orderBy(desc(assessments.createdAt)).limit(1);
  return row ?? null;
}

/** Written placement test submission (called from the client quiz with plain data). */
export async function submitWrittenAssessment(input: { answers: number[]; goal: string; audience: string }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  if (!await hit(`placement:${user.id}`, 10, 3600_000)) redirect("/assessment?err=rate");

  const answers = Array.isArray(input?.answers)
    ? PLACEMENT_QUESTIONS.map((_, i) => {
        const v = Number(input.answers[i]);
        return Number.isInteger(v) && v >= 0 && v <= 3 ? v : -1;
      })
    : PLACEMENT_QUESTIONS.map(() => -1);

  const goal = cleanGoal(String(input?.goal ?? ""));
  const audience = cleanAudience(String(input?.audience ?? "adults"));
  const { score, level } = gradePlacement(answers);
  const matches = await recommendTeachers({ level, goal, audience, nativeLang: user.nativeLang });

  await db.insert(assessments).values({
    studentId: user.id, method: "written", status: "completed",
    goal, audience, score, level, answers,
    recommendedIds: matches.map(m => m.id),
  });
  await db.update(users).set({ level }).where(eq(users.id, user.id));
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

  const [row] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
  if (!row || row.assignedTeacherId !== user.id || row.status !== "scheduled") redirect("/dashboard?err=evaluation");

  const [student] = await db.select({ nativeLang: users.nativeLang }).from(users).where(eq(users.id, row.studentId));
  const matches = await recommendTeachers({
    level, goal: row.goal, audience: row.audience, nativeLang: student?.nativeLang,
  });

  await db.update(assessments).set({
    status: "completed", level, teacherNotes: notes,
    recommendedIds: matches.map(m => m.id), updatedAt: new Date(),
  }).where(eq(assessments.id, row.id));
  await db.update(users).set({ level }).where(eq(users.id, row.studentId));
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
  const [row] = await db.select().from(assessments)
    .where(and(eq(assessments.studentId, user.id), eq(assessments.status, "completed")))
    .orderBy(desc(assessments.createdAt)).limit(1);
  const recommended = Array.isArray(row?.recommendedIds) ? (row.recommendedIds as number[]) : [];
  if (!row || !Number.isInteger(teacherId) || !recommended.includes(teacherId)) {
    redirect("/assessment/results?err=choose");
  }

  await db.update(assessments).set({ selectedTeacherId: teacherId, updatedAt: new Date() })
    .where(eq(assessments.id, row.id));
  revalidatePath("/assessment");
  revalidatePath("/dashboard");
  redirect(`/teachers/${teacherId}`);
}
