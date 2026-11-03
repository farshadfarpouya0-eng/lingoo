// Usage: SID=<cookie> LESSON=<id> TUTOR=<id> BASE=<url> node scripts/smoke.mjs
const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const SID = process.env.SID || "";
const LESSON = process.env.LESSON || "";
const TUTOR = process.env.TUTOR || "";

const routes = [
  "/", "/teachers", "/teachers?audience=kids&tag=Kids", "/login", "/register", "/rules", "/api/health",
  ...(TUTOR ? [`/teachers/${TUTOR}`] : []),
  "/dashboard", "/dashboard?tab=overview", "/dashboard?tab=packages", "/dashboard?tab=lessons",
  "/dashboard?tab=schedule", "/dashboard?tab=materials", "/dashboard?tab=messages",
  "/dashboard?tab=wallet", "/dashboard?tab=profile", "/appeals",
  ...(LESSON ? [`/classroom/${LESSON}`] : []),
  "/admin", "/admin/revenue", "/admin/branding", "/admin/accounts", "/admin/testing", "/admin/tutors",
  "/admin/students", "/admin/lessons", "/admin/payouts", "/admin/content", "/admin/materials",
  "/admin/documents", "/admin/moderation", "/admin/reports", "/admin/teacher-bonuses",
  "/admin/integrations", "/admin/settings",
];

const ERROR_MARKERS = ["This page could not load", "Application error", "Error reference", "Internal Server Error"];
let fails = 0;

for (const path of routes) {
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      headers: SID ? { cookie: `sid=${SID}` } : {},
      signal: AbortSignal.timeout(60_000),
    });
    const ms = Date.now() - started;
    const body = res.status < 300 ? await res.text() : "";
    const marker = ERROR_MARKERS.find(m => body.includes(m));
    if (res.status >= 500 || marker) {
      fails++;
      console.log(`❌ ${res.status}  ${path}  ${marker ? `(${marker})` : ""}`);
    } else if (res.status === 404) {
      fails++;
      console.log(`❌ 404  ${path}  (page missing)`);
    } else if (res.status >= 300) {
      console.log(`↪️  ${res.status}  ${path} -> ${res.headers.get("location")}`);
    } else {
      console.log(`✅ ${res.status}  ${path}  ${ms > 3000 ? `🐢 ${ms}ms` : `${ms}ms`}`);
    }
  } catch (e) {
    fails++;
    console.log(`❌ ERR  ${path}  ${e instanceof Error ? e.message : e}`);
  }
}

console.log(`\n${fails ? `❌ ${fails} problem(s)` : "✅ all pages OK"} · base ${BASE} · ${SID ? "logged in" : "logged out"}`);
process.exit(fails ? 1 : 0);
