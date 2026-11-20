import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings, teacherProfiles } from "@/db/schema";

/**
 * Platform pricing is controlled by the admin only — tutors never set prices.
 * Stored in site_settings under "pricing"; every money amount is integer cents.
 *   student25 / student50 — what students pay per private lesson
 *   fee25 / fee50         — default contracted pay per completed lesson for tutors
 * A tutor's own fee25/fee50 (set by admin in the tutor contract) overrides the default.
 */
export const PRICING_KEY = "pricing";

export type PricingConfig = { student25: number; student50: number; fee25: number; fee50: number };

export const DEFAULT_PRICING: PricingConfig = {
  student25: 1400, // US$14
  student50: 2500, // US$25
  fee25: 600,      // US$6  (~43% of the student price)
  fee50: 1000,     // US$10 (40% of the student price)
};

const cents = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : fallback;
};

export function parsePricingConfig(value: unknown): PricingConfig {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    student25: cents(o.student25, DEFAULT_PRICING.student25),
    student50: cents(o.student50, DEFAULT_PRICING.student50),
    fee25: cents(o.fee25, DEFAULT_PRICING.fee25),
    fee50: cents(o.fee50, DEFAULT_PRICING.fee50),
  };
}

export async function getPricingConfig(): Promise<PricingConfig> {
  const [row] = await db.select({ value: siteSettings.value })
    .from(siteSettings).where(eq(siteSettings.key, PRICING_KEY)).limit(1);
  return parsePricingConfig(row?.value);
}

/** Effective contracted pay for one completed lesson of this duration. */
export async function getTeacherFee(teacherId: number, duration: number): Promise<number> {
  const cfg = await getPricingConfig();
  const [p] = await db.select({ fee25: teacherProfiles.fee25, fee50: teacherProfiles.fee50 })
    .from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId));
  return duration === 25 ? (p?.fee25 ?? cfg.fee25) : (p?.fee50 ?? cfg.fee50);
}
