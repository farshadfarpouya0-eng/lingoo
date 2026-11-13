import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { test } from "node:test";
import { buildSlots, isSlotAvailable, zonedLocalToUtc, COMMON_TIME_ZONES } from "../src/lib/time";
import { groupStudentSlots, publicSlotInstants, studentTimeZone, studentLessonRange } from "../src/lib/student-schedule";
import { cryptoCheckoutStep, cryptoDisplayStatus } from "../src/lib/crypto-checkout-state";
import { videoApiUrl } from "../src/lib/video-api-url";
import { classroomSecurityHeaders } from "../src/lib/security-headers";
import { createJitsiTicket } from "../src/lib/jitsi-video";

const before = Date.parse("2026-11-10T00:00:00.000Z");
const utc = (date: string, time: string) => zonedLocalToUtc(date, time, "Asia/Tehran")!.toISOString();

test("09:00 Tehran is 13:30 in China and 14:30 in Japan; source instant never changes", () => {
  const instant = utc("2026-11-13", "09:00");
  assert.equal(instant, "2026-11-13T05:30:00.000Z");
  for (const [zone, expected] of [["Asia/Shanghai", "13:30"], ["Asia/Tokyo", "14:30"]]) {
    const days = groupStudentSlots([instant], "en", zone, before);
    assert.equal(days[0].slots[0].label, expected);
    assert.equal(days[0].slots[0].iso, instant);
  }
});

test("teacher-day buckets are split at student midnight, not displayed as a two-day label", () => {
  const instants = [utc("2026-11-13", "18:00"), utc("2026-11-13", "20:30"), utc("2026-11-13", "23:30")];
  const china = groupStudentSlots(instants, "zh", "Asia/Shanghai", before);
  assert.deepEqual(china.map(day => day.key), ["2026-11-13", "2026-11-14"]);
  assert.deepEqual(china[1].slots.map(slot => slot.label), ["01:00", "04:00"]);
  const japan = groupStudentSlots(instants, "ja", "Asia/Tokyo", before);
  assert.deepEqual(japan.map(day => day.key), ["2026-11-13", "2026-11-14"]);
  assert.equal(japan[1].slots.at(-1)!.label, "05:00");
});

test("only UTC instants are exposed; private source labels and zone are discarded", () => {
  const iso = utc("2026-11-13", "09:00");
  const teacherDays = [{ key: "private", label: "Teacher time Asia/Tehran", slots: [{ iso, label: "09:00" }] }];
  const output = publicSlotInstants(teacherDays);
  assert.deepEqual(output, [iso]);
  assert.doesNotMatch(JSON.stringify(output), /Tehran|teacher|09:00/);
});

test("account zone wins even when explicitly UTC; visitor may use device zone", () => {
  assert.equal(studentTimeZone("Asia/Tokyo", "en", "America/New_York"), "Asia/Tokyo");
  assert.equal(studentTimeZone("UTC", "zh", "Asia/Shanghai"), "UTC");
  assert.equal(studentTimeZone(null, "ja", "Asia/Shanghai"), "Asia/Shanghai");
  assert.equal(studentTimeZone(null, "ja"), "Asia/Tokyo");
  assert.ok((COMMON_TIME_ZONES as readonly string[]).includes("Asia/Tehran"));
});

test("lead time, chronological sort, duplicates and DST repeated hours are handled", () => {
  const now = Date.parse("2026-11-13T05:00:00Z");
  const first = "2026-11-13T05:30:00Z";
  const rows = groupStudentSlots([first, first, "invalid", "2026-11-13T05:29:59Z"], "en", "Asia/Shanghai", now);
  assert.equal(rows[0].slots.length, 1);
  const dst = groupStudentSlots(["2026-11-01T06:30:00Z", "2026-11-01T05:30:00Z"], "en", "America/New_York", Date.parse("2026-10-31T00:00:00Z"));
  assert.deepEqual(dst[0].slots.map(slot => slot.label), ["01:30", "01:30"]);
  assert.notEqual(dst[0].slots[0].offset, dst[0].slots[1].offset);
});

test("duration fits inside private 09–18 working hours; 18:00 is not a start", () => {
  const avail = { startHour: 9, endHour: 18, workDays: "5", timeZone: "Asia/Tehran" };
  assert.ok(isSlotAvailable(new Date(utc("2026-11-13", "09:00")), avail, 50));
  assert.ok(isSlotAvailable(new Date(utc("2026-11-13", "17:30")), avail, 25));
  assert.equal(isSlotAvailable(new Date(utc("2026-11-13", "17:30")), avail, 50), false);
  assert.equal(isSlotAvailable(new Date(utc("2026-11-13", "18:00")), avail, 25), false);
  const previous = Date.now;
  Date.now = () => before;
  try {
    const instants = publicSlotInstants(buildSlots("en", avail, new Set(), 50));
    const firstDay = groupStudentSlots(instants, "en", "Asia/Shanghai", before)[0];
    assert.equal(firstDay.slots[0].label, "13:30");
    assert.equal(firstDay.slots.at(-1)!.label, "21:30");
  } finally { Date.now = previous; }
  assert.match(studentLessonRange(utc("2026-11-13", "09:00"), 50, "Asia/Shanghai", "en"), /13:30 – 14:20/);
});

test("expiry is never applied to an already submitted or confirmed transfer", () => {
  const expiresAt = "2026-11-01T00:00:00Z";
  const now = Date.parse("2026-11-13T00:00:00Z");
  assert.equal(cryptoDisplayStatus({ status: "awaiting_payment", expiresAt }, now), "expired");
  for (const status of ["pending_review", "confirming", "paid", "partially_paid"]) assert.equal(cryptoDisplayStatus({ status, expiresAt }, now), status);
  assert.equal(cryptoCheckoutStep(), 1);
  assert.equal(cryptoCheckoutStep("awaiting_payment"), 2);
  assert.equal(cryptoCheckoutStep("pending_review"), 3);
  assert.equal(cryptoCheckoutStep("paid"), 3);
});

test("live JaaS and admin checks use the documented AppID-scoped SDK URL", () => {
  const app = `vpaas-magic-cookie-${"a".repeat(32)}`;
  assert.equal(videoApiUrl("8x8.vc", `${app}/lesson`), `https://8x8.vc/${app}/external_api.js`);
  assert.throws(() => videoApiUrl("8x8.vc", "lesson"));
  assert.equal(videoApiUrl("video.school.example", "lesson"), "https://video.school.example/external_api.js");
  assert.throws(() => videoApiUrl("meet.jit.si", "lesson"));
});

test("admin-saved video hostname receives CSP and camera permission without env duplication", () => {
  const headers = classroomSecurityHeaders("video.school.example");
  assert.match(headers["Content-Security-Policy"], /frame-src[^;]+https:\/\/video\.school\.example/);
  assert.match(headers["Content-Security-Policy"], /script-src[^;]+https:\/\/video\.school\.example/);
  assert.match(headers["Permissions-Policy"], /camera=\([^)]*video\.school\.example/);
  assert.doesNotMatch(classroomSecurityHeaders('bad.example\"; script-src *')["Content-Security-Policy"], /script-src \*/);
});

test("video tickets are signed, lesson-scoped and do not grant student moderator rights", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const app = `vpaas-magic-cookie-${"b".repeat(32)}`;
  const video = { mode: "jaas", jaasAppId: app, jaasApiKeyId: "test-key", jaasPrivateKey: privateKey, jitsiDomain: "", jitsiAppId: "", jitsiAppSecret: "" };
  const ticket = createJitsiTicket({ video, room: "lesson-test", userId: 42, displayName: "Student", isTeacher: false, now: 1000, lessonEndsAt: new Date(5000 * 1000) });
  const [header, payload, signature] = ticket.jwt.split(".");
  assert.ok(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), createPublicKey(pair.privateKey), Buffer.from(signature, "base64url")));
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.equal(claims.room, "lesson-test");
  assert.equal(claims.context.user.moderator, "false");
  assert.equal(claims.exp, 1900);
});
