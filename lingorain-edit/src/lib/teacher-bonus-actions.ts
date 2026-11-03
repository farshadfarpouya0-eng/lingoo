"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { parseTeacherBonusPolicy, TEACHER_BONUS_SETTING } from "@/lib/teacher-bonus-policy";

export async function saveTeacherBonusPolicy(fd: FormData) {
  await requireAdmin();
  const minRating = Number(fd.get("minRating"));
  const minReviews = Number(fd.get("minReviews"));
  const percent = Number(fd.get("percent"));
  if (!Number.isFinite(minRating) || minRating < 4 || minRating > 5 || !Number.isInteger(minReviews) || minReviews < 0 || minReviews > 1000 || !Number.isFinite(percent) || percent < 0 || percent > 10) {
    redirect("/admin/teacher-bonuses?result=invalid");
  }
  const policy = parseTeacherBonusPolicy({ enabled: fd.get("enabled") === "on", minRating, minReviews, percent });
  await db.insert(siteSettings).values({ key: TEACHER_BONUS_SETTING, value: policy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: policy, updatedAt: new Date() } });
  revalidatePath("/admin/teacher-bonuses");
  revalidatePath("/teachers");
  revalidatePath("/");
  redirect("/admin/teacher-bonuses?result=saved");
}
