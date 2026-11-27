import { and, desc, eq, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonPackages, teacherProfiles, users } from "@/db/schema";
import { ASSESS } from "@/lib/assessment-i18n";
import { LEARNING } from "@/lib/learning-i18n";
import type { Lang } from "@/lib/i18n";
import { getLatestAssessment, selectedPlacementTutor } from "@/lib/placement";
import { getPricingConfig } from "@/lib/pricing-config";
import PackageShop, { type ShopAccess } from "./PackageShop";

/** The shop receives ONE confirmed tutor or a next step. No directory, history fallback or URL override. */
export default async function PackageDashboard({ studentId, balance, lang }: { studentId: number; balance: number; lang: Lang }) {
  const a = ASSESS[lang];
  const [current, owned] = await Promise.all([
    getLatestAssessment(studentId),
    db.select({ id: lessonPackages.id, teacherId: lessonPackages.teacherId, teacherName: users.name, avatar: users.avatar,
      duration: lessonPackages.duration, totalLessons: lessonPackages.totalLessons, remainingLessons: lessonPackages.remainingLessons,
      unitPrice: lessonPackages.unitPrice, discountPercent: lessonPackages.discountPercent,
    }).from(lessonPackages).innerJoin(users, eq(users.id, lessonPackages.teacherId))
      .where(eq(lessonPackages.studentId, studentId)).orderBy(desc(lessonPackages.createdAt)),
  ]);

  let access: ShopAccess;
  if (current?.method === "written" && current.status === "completed" && current.level) {
    const teacherId = selectedPlacementTutor(current);
    const [teacher] = teacherId ? await db.select({ id: users.id, name: users.name, avatar: users.avatar, headline: teacherProfiles.headline })
      .from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(and(eq(users.id, teacherId), eq(users.role, "teacher"), eq(teacherProfiles.active, true),
        or(eq(users.suspended, false), lte(users.suspendedUntil, new Date())))).limit(1) : [];
    if (teacher) {
      const pricing = await getPricingConfig();
      access = { kind: "assigned", tutor: { ...teacher, price: pricing.student50, price25: pricing.student25 } };
    } else {
      access = { kind: "results", title: a.matchesTitle, description: LEARNING[lang].confirmMatchFirst, href: "/assessment/results", label: a.dashCardViewMatches };
    }
  } else {
    access = { kind: "assessment", title: a.skipTestTitle, description: a.skipTestText, href: "/teachers", label: a.skipTestCta };
  }
  return <PackageShop key={`${current?.id ?? 0}:${access.kind}:${access.kind === "assigned" ? access.tutor.id : 0}`} access={access} owned={owned} balance={balance} c={LEARNING[lang]} />;
}
