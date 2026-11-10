/** Host/start launch URLs are secret bearer links. They may use Zoom /start or /s paths with ZAK tokens. */
export function validZoomHostUrl(raw: string) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return "";
    if (u.hostname !== "zoom.us" && !u.hostname.endsWith(".zoom.us")) return "";
    if (!u.pathname || u.pathname === "/") return "";
    return u.href;
  } catch { return ""; }
}

/** Accept only real Google Meet / Zoom meeting URLs over HTTPS. Returns the normalized URL or "". */
export function validMeetingLink(platform: string, raw: string) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return "";
    if (platform === "meet" && u.hostname === "meet.google.com" && /^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[a-z0-9_-]+)\/?$/i.test(u.pathname)) return u.href;
    if (platform === "zoom" && (u.hostname === "zoom.us" || u.hostname.endsWith(".zoom.us")) && /^\/(?:j|s|my|wc)\/[a-z0-9/_.-]+\/?$/i.test(u.pathname)) return u.href;
    return "";
  } catch { return ""; }
}
