"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonParticipants, lessons, teacherProfiles } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { payTeacher, payGroupSeat } from "@/lib/money";
import { qualifyStudentReferral } from "@/lib/referral-service";

type R = { ok?: boolean; error?: string };

/** The tutor marks the lesson complete after it ends. This is the normal path. */
export async function markLessonComplete(prev: R, formData: FormData): Promise<R> {
  const me = await getUser();
  if (!me) return { ok: false, error: "forbidden" };

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "invalid" };

  const [l] = await db.select().from(lessons).where(eq(lessons.id, id));
  if (!l) return { ok: false, error: "invalid" };
  if (l.teacherId !== me.id && me.role !== "admin") return { ok: false, error: "forbidden" };
  if (["completed", "cancelled"].includes(l.status)) return { ok: false, error: "already" };

  /* must be over — the scheduled end has passed (admins can force-end) */
  const endsAt = l.startAt.getTime() + l.duration * 60_000;
  if (Date.now() < endsAt && me.role !== "admin") return { ok: false, error: "too_early" };

  await db.transaction(async tx => {
    const r = await tx.update(lessons).set({ status: "completed" })
      .where(and(eq(lessons.id, l.id), eq(lessons.status, "confirmed")))
      .returning({ id: lessons.id });
    if (!r.length) return;

    if (l.classType === "semi_private") {
      const seats = await tx.select().from(lessonParticipants)
        .where(and(eq(lessonParticipants.lessonId, l.id), inArray(lessonParticipants.status, ["booked", "attended"])))
        .for("update");

      for (const seat of seats) {
        await payGroupSeat(tx, l.id, l.teacherId, seat.studentId, seat.paidAmount,
          `Semi-private lesson #${l.id} completed by tutor`);
        await tx.update(lessonParticipants)
          .set({ status: "attended" })
          .where(eq(lessonParticipants.id, seat.id));
        if (seat.paidAmount > 0) await qualifyStudentReferral(tx, seat.studentId);
      }

      await tx.update(teacherProfiles)
        .set({ lessonsCount: sql`${teacherProfiles.lessonsCount} + 1` })
        .where(eq(teacherProfiles.userId, l.teacherId));
    } else {
      await payTeacher(tx, l.id, l.teacherId, l.price, "Lesson completed by tutor");
      if (!l.trial && l.price > 0) await qualifyStudentReferral(tx, l.studentId);
    }
  });

  revalidatePath(`/classroom/${id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}