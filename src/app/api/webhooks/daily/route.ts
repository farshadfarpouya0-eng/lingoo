import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonRecordings, lessons } from "@/db/schema";
import { getIntegrationConfig } from "@/lib/integration-config";
import { dailyRoomName } from "@/lib/daily-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

export async function POST(req: Request) {
  const cfg = await getIntegrationConfig();
  const secret = cfg.recording.dailyWebhookPassword;
  if (!secret) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  const expected = `Basic ${Buffer.from(`lingorain:${secret}`).toString("base64")}`;
  if (!safeEqual(req.headers.get("authorization") || "", expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let event: { type?: string; payload?: Record<string, unknown> };
  try { event = await req.json() as typeof event; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const payload = event.payload || {};
  const roomName = typeof payload.room === "string" ? payload.room : typeof payload.room_name === "string" ? payload.room_name : "";
  const match = /^lingorain-(\d+)-[a-f0-9]{12}$/.exec(roomName);
  if (!match) return Response.json({ ok: true, ignored: true });
  const lessonId = Number(match[1]);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1 || dailyRoomName(lessonId) !== roomName) return Response.json({ ok: true, ignored: true });
  const type = event.type || "";
  const rawRecordingId = [payload.recording_id, payload.recordingId, payload.id].find(v => typeof v === "string" && v.length > 0);
  const recordingId = typeof rawRecordingId === "string" ? rawRecordingId.slice(0, 200) : "";
  const [lesson] = await db.select({ id: lessons.id, startAt: lessons.startAt, duration: lessons.duration }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return Response.json({ ok: true, ignored: true });
  const [current] = await db.select().from(lessonRecordings).where(eq(lessonRecordings.lessonId, lessonId)).limit(1);
  if (type === "recording.error") {
    if (current) await db.update(lessonRecordings).set({ status: "error", providerRecordingId: recordingId || current.providerRecordingId }).where(eq(lessonRecordings.lessonId, lessonId));
    return Response.json({ ok: true });
  }
  if (type === "recording.started" || type === "recording.ready-to-download") {
    const status = type === "recording.started" ? "recording" : recordingId ? "ready" : "error";
    const expiresAt = current?.expiresAt || new Date(lesson.startAt.getTime() + (lesson.duration + 15) * 60_000 + 7 * 24 * 60 * 60_000);
    // Webhooks may arrive before the API request stores the recording row. Upsert
    // instead of dropping the event; lesson_id is unique and makes repeats idempotent.
    await db.insert(lessonRecordings).values({ lessonId, provider: "daily", providerRecordingId: recordingId, status, fileUrl: "", expiresAt })
      .onConflictDoUpdate({ target: lessonRecordings.lessonId, set: {
        status,
        ...(recordingId ? { providerRecordingId: recordingId } : {}),
        expiresAt,
      } });
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true, ignored: true });
}
