import { and, asc, desc, eq, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonPackages, teacherProfiles, users } from "@/db/schema";
import { LEARNING } from "@/lib/learning-i18n";
import type { Lang } from "@/lib/i18n";
import PackageShop from "./PackageShop";
import { getPricingConfig } from "@/lib/pricing-config";
export default async function PackageDashboard({ studentId, balance, lang, tutorId }: { studentId: number; balance: number; lang: Lang; tutorId?: number }) {
  const pricing = await getPricingConfig();
  const [tutors, owned] = await Promise.all([
    db.select({id:users.id,name:users.name,avatar:users.avatar,headline:teacherProfiles.headline,
      price:teacherProfiles.price,price25:teacherProfiles.price25,rating:teacherProfiles.rating,speaks:teacherProfiles.speaks,tags:teacherProfiles.tags,certified:teacherProfiles.certified,
    }).from(teacherProfiles).innerJoin(users,eq(users.id,teacherProfiles.userId))
      .where(and(eq(users.role,"teacher"),eq(teacherProfiles.active,true),or(eq(users.suspended,false),lte(users.suspendedUntil,new Date())))).orderBy(asc(users.id)).limit(100),
    db.select({ id: lessonPackages.id, teacherId: lessonPackages.teacherId, teacherName: users.name, avatar: users.avatar,
      duration: lessonPackages.duration, totalLessons: lessonPackages.totalLessons, remainingLessons: lessonPackages.remainingLessons,
      unitPrice: lessonPackages.unitPrice, discountPercent: lessonPackages.discountPercent,
    }).from(lessonPackages).innerJoin(users,eq(users.id,lessonPackages.teacherId)).where(eq(lessonPackages.studentId,studentId)).orderBy(desc(lessonPackages.createdAt)),
  ]);
  return <PackageShop tutors={tutors.map(t => ({ ...t, price: pricing.student50, price25: pricing.student25 }))} owned={owned} balance={balance} c={LEARNING[lang]} initialTutorId={tutorId}/>;
}
