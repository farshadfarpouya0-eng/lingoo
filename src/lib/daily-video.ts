import { createHmac } from "node:crypto";
import { getIntegrationConfig } from "./integration-config";
import { classroomSecret } from "./runtime-policy";

export function dailyRoomName(lessonId: number) {
  return `lingorain-${lessonId}-${createHmac("sha256", classroomSecret()).update(`lesson:${lessonId}`).digest("hex").slice(0, 12)}`;
}

async function dailyRequest(path: string, init: RequestInit = {}) {
  const cfg = await getIntegrationConfig();
  if (!cfg.recording.dailyApiKey || !cfg.recording.dailyDomain) throw new Error("Daily is not configured in Admin → Integrations.");
  const response = await fetch(`https://api.daily.co/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.recording.dailyApiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof data.info === "string" ? data.info : typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new Error(`Daily request failed: ${detail}`);
  }
  return data;
}

export async function ensureDailyRoom(lesson: { id: number; startAt: Date; duration: number; capacity: number }) {
  const cfg = await getIntegrationConfig();
  if (cfg.recording.provider !== "daily") throw new Error("Daily video is not enabled. Select Daily in Admin → Integrations.");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+daily\.co$/i.test(cfg.recording.dailyDomain)) throw new Error("Daily domain must be a subdomain ending in .daily.co.");
  const name = dailyRoomName(lesson.id);
  const expires = Math.floor((lesson.startAt.getTime() + (lesson.duration + 45) * 60_000) / 1000);
  const properties = { enable_recording: "cloud", max_participants: Math.min(5, Math.max(2, lesson.capacity + 1)), exp: expires, eject_at_room_exp: true };
  const body = JSON.stringify({ name, privacy: "private", properties });
  const first = await fetch("https://api.daily.co/v1/rooms", { method: "POST", headers: { Authorization: `Bearer ${cfg.recording.dailyApiKey}`, "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (first.ok) return name;
  if (first.status === 409) {
    // Enforce privacy/expiry even if an earlier request partially created the room.
    const update = await dailyRequest(`/rooms/${encodeURIComponent(name)}`, { method: "POST", body });
    if (update.name === name) return name;
  }
  const err = await first.json().catch(() => ({})) as { info?: string; error?: string };
  throw new Error(`Could not provision a private Daily room: ${err.info || err.error || `HTTP ${first.status}`}`);
}

export async function createDailyToken(input: { lesson: { id: number; startAt: Date; duration: number; capacity: number }; userId: number; displayName: string; isTeacher: boolean }) {
  const cfg = await getIntegrationConfig();
  if (cfg.recording.provider !== "daily") throw new Error("Daily is not enabled.");
  const name = await ensureDailyRoom(input.lesson);
  const now = Math.floor(Date.now() / 1000);
  const nbf = Math.floor((input.lesson.startAt.getTime() - (input.isTeacher ? 30 : 10) * 60_000) / 1000);
  const exp = Math.floor((input.lesson.startAt.getTime() + (input.lesson.duration + 15) * 60_000) / 1000);
  const tokenResult = await dailyRequest("/meeting-tokens", { method: "POST", body: JSON.stringify({ properties: {
    room_name: name, user_id: String(input.userId), user_name: input.displayName.slice(0, 100), is_owner: input.isTeacher,
    nbf: Math.min(nbf, now), exp, enable_recording: input.isTeacher,
  } }) });
  const token = typeof tokenResult.token === "string" ? tokenResult.token : "";
  if (!token) throw new Error("Daily did not return a meeting token.");
  return `https://${cfg.recording.dailyDomain}/${name}?t=${encodeURIComponent(token)}`;
}

export async function dailyApi(path: string, method: string = "GET", body?: Record<string, unknown>) {
  return dailyRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
}
