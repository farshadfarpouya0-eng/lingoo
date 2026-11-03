import { db } from "@/db";
import { users, teacherProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export function teacherQuery() {
  return db
    .select({
      id: users.id, name: users.name, avatar: users.avatar, headline: teacherProfiles.headline, bio: teacherProfiles.bio,
      country: teacherProfiles.country, accent: teacherProfiles.accent, price: teacherProfiles.price, rating: teacherProfiles.rating,
      reviewsCount: teacherProfiles.reviewsCount, lessonsCount: teacherProfiles.lessonsCount, speaks: teacherProfiles.speaks,
      tags: teacherProfiles.tags, certified: teacherProfiles.certified, active: teacherProfiles.active,
      startHour: teacherProfiles.startHour, endHour: teacherProfiles.endHour, tzOffset: teacherProfiles.tzOffset, timeZone: teacherProfiles.timeZone, workDays: teacherProfiles.workDays, credentialVerified: teacherProfiles.credentialVerified,
    })
    .from(teacherProfiles)
    .innerJoin(users, eq(users.id, teacherProfiles.userId));
}
