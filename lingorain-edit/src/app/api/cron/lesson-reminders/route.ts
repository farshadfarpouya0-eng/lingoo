import { timingSafeEqual } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { lessonReminderLogs, lessons, users } from "@/db/schema";
import { activeLessonStudentIds } from "@/lib/lesson-access";
import { getIntegrationConfig } from "@/lib/integration-config";
import { runTrackedJob } from "@/lib/operational-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: Request) {
  // Reminder delivery uses a dedicated secret, separate from settlement and recording cleanup.
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const secret = process.env.REMINDER_CRON_SECRET || "";
  if (!secret || secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

async function claimReminder(lessonId: number, recipientId: number, minutesBefore: number) {
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(lessonReminderLogs).where(and(
      eq(lessonReminderLogs.lessonId, lessonId), eq(lessonReminderLogs.recipientId, recipientId),
      eq(lessonReminderLogs.minutesBefore, minutesBefore),
    )).for("update");
    const now = new Date();
    if (!existing) {
      const [created] = await tx.insert(lessonReminderLogs).values({
        lessonId, recipientId, minutesBefore, status: "sending",
      }).onConflictDoNothing().returning({ id: lessonReminderLogs.id });
      if (created) return created.id;
      // A concurrent worker inserted the unique row first. Inspect it under a row lock.
      const [raced] = await tx.select().from(lessonReminderLogs).where(and(
        eq(lessonReminderLogs.lessonId, lessonId), eq(lessonReminderLogs.recipientId, recipientId),
        eq(lessonReminderLogs.minutesBefore, minutesBefore),
      )).for("update");
      if (!raced) return null;
      if (raced.status === "failed" || raced.status === "pending" || (raced.status === "sending" && now.getTime() - raced.createdAt.getTime() > 5 * 60_000)) {
        const [retry] = await tx.update(lessonReminderLogs).set({ status: "sending", createdAt: now }).where(eq(lessonReminderLogs.id, raced.id)).returning({ id: lessonReminderLogs.id });
        return retry?.id ?? null;
      }
      return null;
    }
    if (existing.status === "sent") return null;
    if (existing.status === "sending" && now.getTime() - existing.createdAt.getTime() <= 5 * 60_000) return null;
    const [claimed] = await tx.update(lessonReminderLogs).set({ status: "sending", createdAt: now })
      .where(eq(lessonReminderLogs.id, existing.id)).returning({ id: lessonReminderLogs.id });
    return claimed?.id ?? null;
  });
}

async function sendEmail(to: string, subject: string, text: string, idempotencyKey: string, apiKey: string, from: string) {
  if (!apiKey || !from) throw new Error("Email provider is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Email provider error (${response.status})`);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runTrackedJob("lesson-reminders", async () => {
    const email = (await getIntegrationConfig()).email;
    if (!email.apiKey || !email.from) throw new Error("Email provider is not configured. Add Resend credentials in Admin → Integrations.");
    const now = Date.now();
    // Pull only relevant upcoming confirmed lessons. The unique DB key plus atomic claim
    // prevents two parallel cron invocations from sending the same reminder.
    const candidates = await db.select({
      id: lessons.id, studentId: lessons.studentId, teacherId: lessons.teacherId, classType: lessons.classType,
      startAt: lessons.startAt, status: lessons.status,
    }).from(lessons).where(and(
      eq(lessons.status, "confirmed"),
      gte(lessons.startAt, new Date(now + 7 * 60_000)),
      lte(lessons.startAt, new Date(now + 33 * 60_000)),
    )).limit(500);
  
    let sent = 0, failed = 0, skipped = 0;
    for (const lesson of candidates) {
      for (const minutesBefore of [30, 10]) {
        const until = lesson.startAt.getTime() - minutesBefore * 60_000;
        // Cron runs every minute. A 3-minute catch-up window prevents brief scheduler delays
        // from dropping reminders; idempotent claims prevent repeated sends in overlapping windows.
        if (until > now || now - until >= 3 * 60_000) continue;
        const studentIds = await activeLessonStudentIds(lesson.id, lesson.studentId, lesson.classType);
        const recipientIds = [...new Set([...studentIds, lesson.teacherId])];
        const recipients = recipientIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, recipientIds)) : [];
        for (const recipientId of recipientIds) {
          const recipient = recipients.find(r => r.id === recipientId);
          if (!recipient?.email) { skipped++; continue; }
          const logId = await claimReminder(lesson.id, recipient.id, minutesBefore);
          if (!logId) { skipped++; continue; }
          try {
            const appUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
            await sendEmail(
              recipient.email,
              `Lingorain class reminder · ${minutesBefore} minutes`,
              `Hi ${recipient.name},\n\nYour Lingorain class (#${lesson.id}) starts in about ${minutesBefore} minutes.\n\nOpen your dashboard: ${appUrl}/dashboard?tab=lessons\nEnter the classroom when your access window opens.\n\nLingorain`,
              `lingorain-reminder-${lesson.id}-${recipient.id}-${minutesBefore}`,
              email.apiKey, email.from,
            );
            await db.update(lessonReminderLogs).set({ status: "sent", sentAt: new Date() }).where(eq(lessonReminderLogs.id, logId));
            sent++;
          } catch {
            await db.update(lessonReminderLogs).set({ status: "failed" }).where(eq(lessonReminderLogs.id, logId));
            failed++;
          }
        }
      }
    }
    return { checked: candidates.length, sent, failed, skipped };
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "reminder_job_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
