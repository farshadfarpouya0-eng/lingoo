import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { assessments, lessonPackages, lessons, teacherProfiles, users } from "@/db/schema";
import { LEARNING } from "@/lib/learning-i18n";
import type { Lang } from "@/lib/i18n";
import PackageShop from "./PackageShop";
import { getPricingConfig } from "@/lib/pricing-config";

/**
 * Students no longer browse every tutor. The package shop only offers the tutors
 * their placement test recommended (or the one they chose) plus tutors they
 * already study or hold credits with. Before the test it invites them to take it.
 */
export default async function PackageDashboard({ studentId, balance, lang, tutorId }: { studentId: number; balance: number; lang: Lang; tutorId?: number }) {
  const pricing = await getPricingConfig();

  const [myAssessments, myLessons, myPackages] = await Promise.all([
    db.select({ recommended: assessments.recommendedIds, selected: assessments.selectedTeacherId })
      .from(assessments).where(eq(assessments.studentId, studentId)).orderBy(desc(assessments.createdAt)).limit(12),
    db.select({ teacherId: lessons.teacherId }).from(lessons).where(eq(lessons.studentId, studentId)).limit(200),
    db.select({ teacherId: lessonPackages.teacherId }).from(lessonPackages).where(eq(lessonPackages.studentId, studentId)),
  ]);

  const allowed = new Set<number>();
  for (const row of myAssessments) {
    if (row.selected) allowed.add(row.selected);
    if (Array.isArray(row.recommended)) for (const id of row.recommended as number[]) allowed.add(id);
  }
  for (const row of myLessons) allowed.add(row.teacherId);
  for (const row of myPackages) allowed.add(row.teacherId);
  if (Number.isInteger(tutorId) && (tutorId as number) > 0) allowed.add(tutorId as number);
  allowed.delete(studentId);

  const [tutors, owned] = await Promise.all([
    allowed.size
      ? db.select({id:users.id,name:users.name,avatar:users.avatar,headline:teacherProfiles.headline,
          price:teacherProfiles.price,price25:teacherProfiles.price25,rating:teacherProfiles.rating,speaks:teacherProfiles.speaks,tags:teacherProfiles.tags,certified:teacherProfiles.certified,
        }).from(teacherProfiles).innerJoin(users,eq(users.id,teacherProfiles.userId))
          .where(and(eq(users.role,"teacher"),eq(teacherProfiles.active,true),inArray(users.id,[...allowed]),or(eq(users.suspended,false),lte(users.suspendedUntil,new Date())))).orderBy(asc(users.id))
      : Promise.resolve([]),
    db.select({ id: lessonPackages.id, teacherId: lessonPackages.teacherId, teacherName: users.name, avatar: users.avatar,
      duration: lessonPackages.duration, totalLessons: lessonPackages.totalLessons, remainingLessons: lessonPackages.remainingLessons,
      unitPrice: lessonPackages.unitPrice, discountPercent: lessonPackages.discountPercent,
    }).from(lessonPackages).innerJoin(users,eq(users.id,lessonPackages.teacherId)).where(eq(lessonPackages.studentId,studentId)).orderBy(desc(lessonPackages.createdAt)),
  ]);

  return <PackageShop
    tutors={tutors.map(t => ({ ...t, price: pricing.student50, price25: pricing.student25 }))}
    owned={owned} balance={balance} c={LEARNING[lang]} initialTutorId={tutorId}
    matchedOnly={!myAssessments.length}
  />;
}
