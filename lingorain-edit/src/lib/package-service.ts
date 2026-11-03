import { and, eq, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonPackages, teacherProfiles, users } from "@/db/schema";
import { quotePackage } from "./package-pricing";
import { isAccountSuspended } from "./account-status";
import { ledger } from "./money";

export type PackagePurchaseInput = { teacherId: number; duration: number; count: number; purchaseKey: string; expectedTotal?: number };
export async function purchaseLessonPackage(studentId: number, input: PackagePurchaseInput) {
  if (!Number.isInteger(input.teacherId) || !/^[a-f0-9-]{36}$/i.test(input.purchaseKey)) throw new Error("plan");
  return db.transaction(async tx => {
    // Serialise each learner's spending and the same checkout retry.
    const [student] = await tx.select().from(users).where(eq(users.id, studentId)).for("update");
    if (!student || student.role !== "student" || isAccountSuspended(student.suspended, student.suspendedUntil)) throw new Error("forbidden");
    const [previous] = await tx.select().from(lessonPackages).where(eq(lessonPackages.purchaseKey, input.purchaseKey));
    if (previous) {
      if (previous.studentId !== studentId) throw new Error("forbidden");
      return previous;
    }
    const [tutor] = await tx.select({ price: teacherProfiles.price }).from(teacherProfiles)
      .innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(and(eq(users.role, "teacher"), eq(teacherProfiles.userId, input.teacherId), eq(teacherProfiles.active, true), or(eq(users.suspended, false), and(eq(users.suspended, true), lte(users.suspendedUntil, new Date())))));
    if (!tutor) throw new Error("plan");
    const q = quotePackage(tutor.price, input.duration, input.count);
    if (q.count === 1 || (input.expectedTotal !== undefined && input.expectedTotal !== q.totalPrice)) throw new Error("plan");
    if (student.balance < q.totalPrice) throw new Error("balance");
    await tx.update(users).set({ balance: student.balance - q.totalPrice }).where(eq(users.id, studentId));
    const [pack] = await tx.insert(lessonPackages).values({
      studentId, teacherId: input.teacherId, duration: q.duration, totalLessons: q.count, remainingLessons: q.count,
      unitPrice: q.unitPrice, originalUnitPrice: q.originalUnitPrice, discountPercent: q.discount, totalPrice: q.totalPrice,
      purchaseKey: input.purchaseKey,
    }).returning();
    await ledger(tx, studentId, "package_purchase", -q.totalPrice, `${q.count} × ${q.duration} min · ${q.discount}% off · package #${pack.id}`, undefined, `package:${input.purchaseKey}`);
    return pack;
  });
}
