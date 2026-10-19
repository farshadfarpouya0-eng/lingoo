import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonRecordings } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { dailyApi } from "@/lib/daily-video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !["teacher", "student"].includes(user.role)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !(await canAccessLesson(lessonId, user.id))) return Response.json({ error: "Not found" }, { status: 404 });
  const [recording] = await db.select().from(lessonRecordings).where(eq(lessonRecordings.lessonId, lessonId)).limit(1);
  if (!recording || recording.provider !== "daily" || recording.status !== "ready" || !recording.providerRecordingId || recording.expiresAt.getTime() <= Date.now()) return Response.json({ error: "Recording is not available." }, { status: 404 });
  try {
    const result = await dailyApi(`/recordings/${encodeURIComponent(recording.providerRecordingId)}/access-link`);
    const link = typeof result.download_link === "string" ? result.download_link : "";
    const parsed = new URL(link);
    if (parsed.protocol !== "https:" || !parsed.hostname) return Response.json({ error: "Recording link is unavailable." }, { status: 502 });
    return new Response(null, { status: 302, headers: { Location: parsed.href, "Cache-Control": "no-store, private, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ error: "Could not generate a temporary recording link." }, { status: 502, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
