// Validate the actual public preview, not merely an HTTP 200 or a DB ping.
// No credentials are needed and no data is created/changed by this script.
const input = process.argv[2] || process.env.PREVIEW_URL;
if (!input) throw new Error("Pass the current preview origin as an argument or PREVIEW_URL.");
const parsed = new URL(input);
if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
  throw new Error("Preview URL must be an HTTP(S) origin without credentials.");
}
const origin = parsed.origin;
async function request(path) {
  const response = await fetch(`${origin}${path}`, { redirect: "follow", signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response;
}
for (const [path, required] of [
  ["/", ["Lingorain", "Find an English tutor", "/images/hero-adults", "/images/hero-kids"]],
  ["/teachers", ["Find Tutors", "Lingorain"]],
  ["/login", ["Log in", "current-password"]],
]) {
  const response = await request(path);
  const body = await response.text();
  if (/:E\{[^\n]*digest/.test(body) || body.includes('id="__next_error__"') || body.includes("This page could not load")) {
    throw new Error(`${path}: server-rendered error found despite HTTP 200`);
  }
  for (const text of required) if (!body.includes(text)) throw new Error(`${path}: expected page content is missing`);
  if (path === "/") {
    const stylesheet = body.match(/href="(\/_next\/static\/[^" ]+\.css)"/);
    if (!stylesheet) throw new Error("Homepage stylesheet was not linked");
    const css = await request(stylesheet[1]);
    if (!(css.headers.get("content-type") || "").includes("text/css")) throw new Error("Stylesheet was not served as CSS");
  }
  console.log(`PASS public ${path}: real page content rendered`);
}
for (const path of ["/images/hero-adults-400.webp", "/images/hero-kids.webp", "/images/kids-birdie.webp"]) {
  const response = await request(path);
  if (!(response.headers.get("content-type") || "").startsWith("image/")) throw new Error(`${path}: image did not render`);
  await response.arrayBuffer();
  console.log(`PASS public ${path}: image available`);
}
const health = await (await request("/api/health")).json();
if (health.ok !== true) throw new Error("App/database health failed");
console.log(`PASS current public preview verified: ${origin}`);
