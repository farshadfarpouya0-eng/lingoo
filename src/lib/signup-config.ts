import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

/**
 * Sign-up policy, controlled by the admin only (Admin → Settings).
 *   requireEmailVerification — when off (default), new accounts are active immediately
 *   and the user is signed in right after registering. When on, a verification link is
 *   emailed and the account cannot sign in until it is confirmed (needs Resend configured).
 */
export const SIGNUP_KEY = "signup";

export type SignupConfig = { requireEmailVerification: boolean };

export const DEFAULT_SIGNUP: SignupConfig = { requireEmailVerification: false };

export function parseSignupConfig(value: unknown): SignupConfig {
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { requireEmailVerification: o.requireEmailVerification === true };
}

export async function getSignupConfig(): Promise<SignupConfig> {
  try {
    const [row] = await db.select({ value: siteSettings.value })
      .from(siteSettings).where(eq(siteSettings.key, SIGNUP_KEY)).limit(1);
    return parseSignupConfig(row?.value);
  } catch {
    return DEFAULT_SIGNUP;
  }
}
