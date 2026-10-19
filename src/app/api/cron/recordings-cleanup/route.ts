import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { lessonRecordings } from "@/db/schema";
import { dailyRoomName, dailyApi } from "@/lib/daily-video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function authorized(req: Request) {
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supplied) return false;
  let accepted = false;
  for (const secret of [process.env.CRON_SECRET, process.env.REMINDER_CRON_SECRET]) {
    if (!secret || secret.length < 32) continue;
    const matches = supplied.length === secret.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
    accepted = accepted || matches;
  }
  return accepted;
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const expired = await db.select().from(lessonRecordings).where(and(lte(lessonRecordings.expiresAt, now), inArray(lessonRecordings.status, ["ready", "processing", "recording", "error"]))).limit(100);
  let deleted = 0, failed = 0;
  for (const row of expired) {
    if (row.provider === "daily" && row.status === "recording") {
      try { await dailyApi(`/rooms/${encodeURIComponent(dailyRoomName(row.lessonId))}/recordings/stop`, "POST"); }
      catch { /* It may already have been stopped; continue to expire local metadata. */ }
    }
    if (row.provider === "daily" && row.providerRecordingId) {
      try { await dailyApi(`/recordings/${encodeURIComponent(row.providerRecordingId)}`, "DELETE"); }
      catch (e) {
        const message = e instanceof Error ? e.message : "Daily deletion failed";
        // A 404 means the provider has already removed it; all other errors remain retryable.
        if (!/404|not found/i.test(message)) { failed++; continue; }
      }
    }
    await db.update(lessonRecordings).set({ status: "deleted", providerRecordingId: "", fileUrl: "" }).where(eq(lessonRecordings.id, row.id));
    deleted++;
  }
  return Response.json({ ok: true, deleted, failed, checked: expired.length }, { headers: { "Cache-Control": "no-store" } });
}
