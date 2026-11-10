import { validMeetingLink, validZoomHostUrl } from "./meeting-links";

export type ZoomCredentials = { accountId: string; clientId: string; clientSecret: string };
export const zoomConfigured = (c: ZoomCredentials) => !!(c.accountId && c.clientId && c.clientSecret);

/** Numeric scheduled/PMI meeting id from a normal Zoom join/start URL. Vanity /my/ names are not resolvable here. */
export function zoomMeetingIdFromUrl(raw: string): string {
  const normalized = validMeetingLink("zoom", raw);
  if (!normalized) return "";
  try {
    const u = new URL(normalized);
    const path = u.pathname.match(/\/(?:j|s|wc\/join)\/(\d{6,20})(?:\/|$)/i);
    if (path) return path[1];
    const confno = u.searchParams.get("confno");
    return confno && /^\d{6,20}$/.test(confno) ? confno : "";
  } catch { return ""; }
}

export async function getZoomAccessToken(c: ZoomCredentials): Promise<string> {
  if (!zoomConfigured(c)) throw new Error("Zoom managed launch is not configured.");
  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(c.accountId)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string; reason?: string };
  if (!response.ok || !data.access_token) throw new Error("Zoom OAuth failed. Check Account ID, Client ID, Client Secret and app scopes.");
  return data.access_token;
}

/** Retrieve a fresh host start_url. Zoom start_url/ZAK expires, so never cache it for students or long-term. */
export async function fetchZoomHostStartUrl(c: ZoomCredentials, meetingId: string): Promise<string> {
  if (!/^\d{6,20}$/.test(meetingId)) throw new Error("The Zoom room link must contain a numeric meeting ID.");
  const token = await getZoomAccessToken(c);
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({})) as { start_url?: string; message?: string };
  if (!response.ok) throw new Error("Zoom could not retrieve the host start link. The meeting must belong to the connected Zoom account.");
  const start = validZoomHostUrl(data.start_url || "");
  if (!start) throw new Error("Zoom did not return a usable host start link.");
  return start;
}
