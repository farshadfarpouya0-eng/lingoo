import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { referrals, referralRewards, users } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A referral qualifies only after the referred student completes a paid, non-trial lesson. */
export async function qualifyStudentReferral(tx: Tx, referredStudentId: number) {
  const [referral] = await tx.select().from(referrals)
    .where(and(eq(referrals.referredUserId, referredStudentId), eq(referrals.status, "registered")))
    .for("update");
  if (!referral) return false;
  await tx.update(referrals).set({ status: "qualified" }).where(eq(referrals.id, referral.id));
  return true;
}

export async function ensureReferralCode(userId: number) {
  return db.transaction(async tx => {
    const [user] = await tx.select({ id: users.id, referralCode: users.referralCode }).from(users)
      .where(eq(users.id, userId)).for("update");
    if (!user) throw new Error("not_found");
    if (user.referralCode) return user.referralCode;
    // Collision probability is negligible, while the unique index remains the final guard.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomCode();
      const [updated] = await tx.update(users).set({ referralCode: code })
        .where(and(eq(users.id, userId), sql`${users.referralCode} is null`)).returning({ referralCode: users.referralCode });
      if (updated?.referralCode) return updated.referralCode;
      const [fresh] = await tx.select({ referralCode: users.referralCode }).from(users).where(eq(users.id, userId));
      if (fresh?.referralCode) return fresh.referralCode;
    }
    throw new Error("code_generation_failed");
  });
}
function randomCode() {
  return randomBytes(6).toString("hex").toUpperCase();
}

export async function referralProgress(userId: number) {
  const [qualified] = await db.select({ count: sql<number>`count(*)::int` }).from(referrals)
    .where(and(eq(referrals.referrerId, userId), eq(referrals.status, "qualified")));
  const [claimed] = await db.select({ count: sql<number>`count(*)::int` }).from(referralRewards)
    .where(and(eq(referralRewards.userId, userId), eq(referralRewards.rewardType, "referral")));
  const qualifiedCount = Number(qualified?.count || 0);
  const rewardChoices = Math.max(0, Math.floor(qualifiedCount / 3) - Number(claimed?.count || 0));
  return { qualified: qualifiedCount, rewardChoices };
}
