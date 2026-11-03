import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { lessonRecordings } from "@/db/schema";
import { dailyRoomName, dailyApi } from "@/lib/daily-video";
import { runTrackedJob } from "@/lib/operational-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function authorized(req: Request) {
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supplied) return false;
  const secret = process.env.CRON_SECRET || "";
  if (!secret || secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runTrackedJob("recordings-cleanup", async () => {
    const now = new Date();
    let deleted = 0, failed = 0, stopRetried = 0;
  
    // Consent withdrawal may leave a provider stop pending if Daily was
    // temporarily unavailable. Retry independently of the seven-day expiry.
    const staleRetryCutoff = new Date(now.getTime() - 60_000);
    const pendingStops = await db.select().from(lessonRecordings)
      .where(or(
        eq(lessonRecordings.status, "stop_pending"),
        and(eq(lessonRecordings.status, "stop_retrying"), lte(lessonRecordings.updatedAt, staleRetryCutoff)),
      )).limit(100);
    for (const row of pendingStops) {
      // Atomically claim the retry so overlapping schedulers cannot issue
      // concurrent stop calls for the same recording.
      const [claimed] = await db.update(lessonRecordings).set({ status: "stop_retrying", updatedAt: new Date() })
        .where(and(eq(lessonRecordings.id, row.id), or(
          eq(lessonRecordings.status, "stop_pending"),
          and(eq(lessonRecordings.status, "stop_retrying"), lte(lessonRecordings.updatedAt, staleRetryCutoff)),
        )))
        .returning({ id: lessonRecordings.id });
      if (!claimed) continue;
      try {
        if (row.provider === "daily") await dailyApi(`/rooms/${encodeURIComponent(dailyRoomName(row.lessonId))}/recordings/stop`, "POST");
        await db.update(lessonRecordings).set({ status: "processing", updatedAt: new Date() })
          .where(and(eq(lessonRecordings.id, row.id), eq(lessonRecordings.status, "stop_retrying")));
        stopRetried++;
      } catch {
        await db.update(lessonRecordings).set({ status: "stop_pending", updatedAt: new Date() })
          .where(and(eq(lessonRecordings.id, row.id), eq(lessonRecordings.status, "stop_retrying")));
        failed++;
      }
    }
  
    const expired = await db.select().from(lessonRecordings).where(and(lte(lessonRecordings.expiresAt, now), inArray(lessonRecordings.status, ["ready", "processing", "recording", "error"]))).limit(100);
    for (const row of expired) {
      if (row.provider === "daily" && row.status === "recording") {
        try { await dailyApi(`/rooms/${encodeURIComponent(dailyRoomName(row.lessonId))}/recordings/stop`, "POST"); }
        catch { failed++; continue; }
      }
      if (row.provider === "daily" && row.providerRecordingId) {
        try { await dailyApi(`/recordings/${encodeURIComponent(row.providerRecordingId)}`, "DELETE"); }
        catch (e) {
          const message = e instanceof Error ? e.message : "Daily deletion failed";
          // A 404 means the provider has already removed it; all other errors remain retryable.
          if (!/404|not found/i.test(message)) { failed++; continue; }
        }
      }
      await db.update(lessonRecordings).set({ status: "deleted", providerRecordingId: "", fileUrl: "", updatedAt: new Date() }).where(eq(lessonRecordings.id, row.id));
      deleted++;
    }
    return { ok: true, deleted, failed, stopRetried, checked: expired.length + pendingStops.length };
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "recordings_cleanup_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
