import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const TEACHER_BONUS_SETTING = "teacher_bonus_policy";
export type TeacherBonusPolicy = {
  enabled: boolean;
  minRating: number;
  minReviews: number;
  percent: number;
};
export const DEFAULT_TEACHER_BONUS_POLICY: TeacherBonusPolicy = {
  enabled: false,
  minRating: 4.8,
  minReviews: 10,
  percent: 5,
};

export function parseTeacherBonusPolicy(value: unknown): TeacherBonusPolicy {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const minRating = Number(raw.minRating);
  const minReviews = Number(raw.minReviews);
  const percent = Number(raw.percent);
  return {
    enabled: raw.enabled === true,
    minRating: Number.isFinite(minRating) ? Math.min(5, Math.max(4, minRating)) : DEFAULT_TEACHER_BONUS_POLICY.minRating,
    minReviews: Number.isFinite(minReviews) ? Math.min(1000, Math.max(0, Math.floor(minReviews))) : DEFAULT_TEACHER_BONUS_POLICY.minReviews,
    // Keep at least 5% of lesson gross for the platform when the base tutor share is 85%.
    percent: Number.isFinite(percent) ? Math.min(10, Math.max(0, percent)) : DEFAULT_TEACHER_BONUS_POLICY.percent,
  };
}

export async function getTeacherBonusPolicy(): Promise<TeacherBonusPolicy> {
  const [row] = await db.select({ value: siteSettings.value }).from(siteSettings)
    .where(eq(siteSettings.key, TEACHER_BONUS_SETTING)).limit(1);
  return parseTeacherBonusPolicy(row?.value);
}
