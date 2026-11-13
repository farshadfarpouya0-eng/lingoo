import { getUser } from "@/lib/auth";
import { getIntegrationConfig, testIntegrationProvider } from "@/lib/integration-config";
import { diagnoseVideoConfig, VIDEO_ISSUE_MESSAGES } from "@/lib/video-provider";
import { createJitsiTicket } from "@/lib/jitsi-video";
import { videoApiUrl } from "@/lib/video-api-url";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Check = { name: string; ok: boolean; detail: string };

export async function POST() {
  const user = await getUser();
  if (!user || user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers });
  if (!await hit(`video-check:${user.id}`, 10, 600_000)) return Response.json({ error: "Please wait before testing again." }, { status: 429, headers });
  const checks: Check[] = [];
  try {
    const cfg = await getIntegrationConfig();
    const diagnosis = diagnoseVideoConfig(cfg.video);
    checks.push({ name: "Saved video configuration", ok: diagnosis.issue === "ready", detail: VIDEO_ISSUE_MESSAGES[diagnosis.issue] });
    if (diagnosis.issue !== "ready") return Response.json({ checks }, { headers });
    const ticket = createJitsiTicket({ video: cfg.video, room: "lingorain-diagnostics", userId: user.id, displayName: "Configuration test", isTeacher: true, lessonEndsAt: new Date(Date.now() + 60_000) });
    checks.push({ name: "Server-side token signing", ok: true, detail: "A lesson-scoped access token can be signed. No token or private key is sent by this check." });
    const scriptUrl = videoApiUrl(ticket.domain, ticket.roomName);
    try {
      await testIntegrationProvider("video");
      checks.push({ name: "Video API from this server", ok: true, detail: "The configured video server returned its classroom API." });
    } catch {
      checks.push({ name: "Video API from this server", ok: false, detail: "The video API could not be reached or did not return a valid script. Check the saved hostname and provider availability." });
    }
    return Response.json({ checks, scriptUrl, liveCallTested: false }, { headers });
  } catch {
    checks.push({ name: checks.length ? "Token signing" : "Reading saved credentials", ok: false, detail: checks.length ? "The signing key could not be used. Check the private-key format and matching App ID / Key ID." : "Saved credentials could not be read. Check database access and the original integration encryption key. Do not replace that key without re-encrypting existing settings." });
    return Response.json({ checks, liveCallTested: false }, { headers });
  }
}
