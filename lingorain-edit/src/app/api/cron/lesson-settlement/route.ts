import { timingSafeEqual } from "node:crypto";
import { settleLessons } from "@/lib/money";
import { runTrackedJob } from "@/lib/operational-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: Request) {
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const secret = process.env.CRON_SECRET || "";
  if (!secret || secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runTrackedJob("lesson-settlement", async () => {
      await settleLessons({ force: true });
      return { ok: true, settledAt: new Date().toISOString() };
    });
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "settlement_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
