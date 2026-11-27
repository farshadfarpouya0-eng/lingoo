"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, users } from "@/db/schema";
import { getUser } from "./auth";
import { hit } from "./ratelimit";
import {
  GOALS, getPlacementQuestions, gradePlacement,
  confirmPlacementTutor, recommendTeachers,
} from "./placement";


/** Written placement test submission (called from the client quiz with plain data). */
export async function submitWrittenAssessment(input: { answers: number[]; goal: string; audience: string }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  if (!await hit(`placement:${user.id}`, 10, 3600_000)) redirect("/assessment?err=rate");

  const goal = (GOALS as readonly string[]).includes(String(input?.goal ?? "")) ? String(input.goal) : "";
  const answers = input?.answers;
  const questions = getPlacementQuestions(goal);
  if (!Array.isArray(answers) || answers.length !== questions.length ||
    !Array.from(answers).every(v => Number.isInteger(v) && v >= 0 && v < 4)) return { error: "answers" };

  const audience = input?.audience === "kids" ? "kids" : "adults";
  const { score, level } = gradePlacement(answers, goal);
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
