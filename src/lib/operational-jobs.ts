import { db } from "@/db";
import { scheduledJobRuns } from "@/db/schema";
import { eq } from "drizzle-orm";

/** Persist the lifecycle and summary of a cron job without making monitoring failures block the job itself. */
export async function runTrackedJob<T extends Record<string, unknown>>(job: string, task: () => Promise<T>): Promise<T> {
  const startedAt = new Date();
  let runId: number | undefined;
  try {
    const [row] = await db.insert(scheduledJobRuns).values({ job, status: "running", startedAt }).returning({ id: scheduledJobRuns.id });
    runId = row?.id;
  } catch { /* The job must still run if its monitoring table is not yet migrated. */ }
  try {
    const summary = await task();
    const partial = Number(summary.failed ?? 0) > 0;
    if (runId) await db.update(scheduledJobRuns).set({ status: partial ? "partial" : "succeeded", finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), summary }).where(eq(scheduledJobRuns.id, runId)).catch(() => undefined);
    return summary;
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Unknown scheduled job error").slice(0, 1000);
    if (runId) await db.update(scheduledJobRuns).set({ status: "failed", finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), error: message }).where(eq(scheduledJobRuns.id, runId)).catch(() => undefined);
    throw error;
  }
}
