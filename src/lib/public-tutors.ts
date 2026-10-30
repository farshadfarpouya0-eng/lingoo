import { unstable_cache } from "next/cache";
import { and, desc, eq, sql, or, lte } from "drizzle-orm";
import { teacherProfiles, users } from "@/db/schema";
import { teacherQuery } from "./queries";

export const PUBLIC_TUTORS_TAG = "lingorain-public-tutors";

/** Public catalog only. Never cache sessions, wallets, bookings or availability. */
export const getFeaturedTeachers = unstable_cache(
  async () => teacherQuery()
    .where(and(eq(users.role, "teacher"), eq(teacherProfiles.active, true), or(eq(users.suspended, false), lte(users.suspendedUntil, sql`now()`))))
    .orderBy(desc(sql<number>`((${teacherProfiles.rating} * ${teacherProfiles.reviewsCount} + 4.5 * 5.0) / (${teacherProfiles.reviewsCount} + 5.0))`)).limit(6),
  ["lingorain-featured-tutors-v3"],
  { revalidate: 60, tags: [PUBLIC_TUTORS_TAG] },
);
