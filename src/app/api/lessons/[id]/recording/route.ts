import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessonParticipants, lessonRecordingConsents, lessonRecordings, lessons } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { activeLessonStudentIds, canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { dailyApi, dailyRoomName } from "@/lib/daily-video";
import { getIntegrationConfig } from "@/lib/integration-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function stateFor(lessonId: number, userId: number) {
  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson || !(await canAccessLesson(lessonId, userId))) throw new Error("not_found");
  const studentIds = await activeLessonStudentIds(lesson.id, lesson.studentId, lesson.classType);
  const requiredIds = [...new Set([lesson.teacherId, ...studentIds])];
  const consents = requiredIds.length ? await db.select().from(lessonRecordingConsents).where(and(eq(lessonRecordingConsents.lessonId, lessonId), inArray(lessonRecordingConsents.userId, requiredIds))) : [];
  const consentByUser = new Map(consents.map(c => [c.userId, c.consented]));
  const [recording] = await db.select().from(lessonRecordings).where(eq(lessonRecordings.lessonId, lessonId)).limit(1);
  const cfg = await getIntegrationConfig();
  const snapshot = await classroomSnapshot(userId, lessonId, "Participant");
  return { lesson, requiredIds, consentByUser, recording, cfg, snapshot, everyoneConsented: requiredIds.every(id => consentByUser.get(id) === true) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Not found" }, 404);
  try {
    const s = await stateFor(id, user.id);
    const isTeacher = user.id === s.lesson.teacherId;
    const isDaily = s.lesson.platform === "daily" && s.cfg.recording.provider === "daily";
    const webhookConfigured = !!(s.cfg.recording.dailyWebhookId && s.cfg.recording.dailyWebhookPassword);
    const expired = !!s.recording && s.recording.expiresAt.getTime() <= Date.now();
    const canStart = isDaily && webhookConfigured && isTeacher && s.snapshot.state === "open" && s.everyoneConsented && !s.recording && !expired;
    return json({ enabled: isDaily, webhookConfigured, platform: s.lesson.platform, isTeacher, userConsented: s.consentByUser.get(user.id) === true,
      everyoneConsented: s.everyoneConsented, requiredCount: s.requiredIds.length, consentCount: [...s.consentByUser.values()].filter(Boolean).length,
      status: expired ? "expired" : (s.recording?.status || "none"), expiresAt: s.recording?.expiresAt.toISOString() || null,
      canStart, canStop: isDaily && isTeacher && s.recording?.status === "recording", downloadUrl: s.recording?.status === "ready" && !expired ? `/api/private-files/recording/${id}` : "" });
  } catch { return json({ error: "Lesson not found" }, 404); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Not found" }, 404);
  let input: { action?: string; consented?: boolean };
  try { input = await req.json() as typeof input; } catch { return json({ error: "Invalid JSON" }, 400); }
  try {
    const s = await stateFor(id, user.id);
    if (s.lesson.platform !== "daily" || s.cfg.recording.provider !== "daily") return json({ error: "Daily recording is not enabled for this lesson." }, 409);
    if (input.action === "consent") {
      if (s.snapshot.state === "closed" || s.lesson.status === "cancelled") return json({ error: "The class is no longer active." }, 409);
      const consented = input.consented === true;
      await db.transaction(async tx => {
        const [locked] = await tx.select({ id: lessons.id, status: lessons.status }).from(lessons).where(eq(lessons.id, id)).for("update");
        if (!locked || locked.status === "cancelled") throw new Error("class_closed");
        await tx.insert(lessonRecordingConsents).values({ lessonId: id, userId: user.id, consented, consentedAt: consented ? new Date() : null, updatedAt: new Date() })
          .onConflictDoUpdate({ target: [lessonRecordingConsents.lessonId, lessonRecordingConsents.userId], set: { consented, consentedAt: consented ? new Date() : null, updatedAt: new Date() } });
        if (!consented) {
          const [recording] = await tx.select().from(lessonRecordings).where(eq(lessonRecordings.lessonId, id)).for("update");
          if (recording?.status === "recording") {
            try { await dailyApi(`/rooms/${encodeURIComponent(dailyRoomName(id))}/recordings/stop`, "POST"); } catch { /* A later webhook/cleanup reconciles provider state. */ }
            await tx.update(lessonRecordings).set({ status: "processing" }).where(eq(lessonRecordings.lessonId, id));
          }
        }
      });
      return json({ ok: true, consented });
    }
    if (user.id !== s.lesson.teacherId) return json({ error: "Only the teacher can control recording." }, 403);
    if (s.snapshot.state !== "open") return json({ error: "Recording can only be controlled during class." }, 403);
    if (input.action === "start") {
      if (!s.cfg.recording.dailyWebhookId || !s.cfg.recording.dailyWebhookPassword) return json({ error: "Register the Daily webhook in Admin → Integrations before recording." }, 409);
      const result = await db.transaction(async tx => {
        const [lesson] = await tx.select().from(lessons).where(eq(lessons.id, id)).for("update");
        if (!lesson || lesson.status !== "confirmed" || lesson.platform !== "daily") return { error: "class_state" } as const;
        const [recording] = await tx.select().from(lessonRecordings).where(eq(lessonRecordings.lessonId, id)).for("update");
        if (recording) return { error: "already_recorded" } as const;
        const seats = lesson.classType === "semi_private"
          ? await tx.select({ studentId: lessonParticipants.studentId }).from(lessonParticipants).where(and(eq(lessonParticipants.lessonId, id), inArray(lessonParticipants.status, ["booked", "attended"])))
          : [{ studentId: lesson.studentId }];
        const participantIds = [...new Set([lesson.teacherId, ...seats.map(x => x.studentId)])];
        const consents = await tx.select({ userId: lessonRecordingConsents.userId, consented: lessonRecordingConsents.consented }).from(lessonRecordingConsents).where(and(eq(lessonRecordingConsents.lessonId, id), inArray(lessonRecordingConsents.userId, participantIds)));
        const consentMap = new Map(consents.map(c => [c.userId, c.consented]));
        if (!participantIds.every(participantId => consentMap.get(participantId) === true)) return { error: "consent" } as const;
        // Holding the lesson lock through the provider request serializes simultaneous starts
        // and prevents a consent-revocation request from racing past the start operation.
        await dailyApi(`/rooms/${encodeURIComponent(dailyRoomName(id))}/recordings/start`, "POST");
        const expiresAt = new Date(lesson.startAt.getTime() + (lesson.duration + 15) * 60_000 + 7 * 24 * 60 * 60_000);
        await tx.insert(lessonRecordings).values({ lessonId: id, provider: "daily", providerRecordingId: "", status: "recording", fileUrl: "", expiresAt });
        return { ok: true, status: "recording" } as const;
      });
      if ("error" in result) return json({ error: result.error === "consent" ? "Every current participant must consent before recording starts." : result.error === "already_recorded" ? "A recording already exists for this lesson." : "The lesson is not in a recordable state." }, 409);
      return json(result);
    }
    if (input.action === "stop") {
      const stopped = await db.transaction(async tx => {
        const [lesson] = await tx.select({ id: lessons.id, status: lessons.status }).from(lessons).where(eq(lessons.id, id)).for("update");
        if (!lesson || lesson.status !== "confirmed") return false;
        const [recording] = await tx.select().from(lessonRecordings).where(eq(lessonRecordings.lessonId, id)).for("update");
        if (recording?.status !== "recording") return false;
        await dailyApi(`/rooms/${encodeURIComponent(dailyRoomName(id))}/recordings/stop`, "POST");
        await tx.update(lessonRecordings).set({ status: "processing" }).where(eq(lessonRecordings.lessonId, id));
        return true;
      });
      if (!stopped) return json({ error: "No active recording." }, 409);
      return json({ ok: true, status: "processing" });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") return json({ error: "Lesson not found" }, 404);
    if (error instanceof Error && error.message === "class_closed") return json({ error: "The class is no longer active." }, 409);
    const message = error instanceof Error ? error.message : "Recording operation failed.";
    return json({ error: message.slice(0, 220) }, 502);
  }
}
