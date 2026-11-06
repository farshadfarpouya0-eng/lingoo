import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { lessons, lessonParticipants, sessions, siteSettings, users } from "../src/db/schema";
import { saveIntegrationProvider } from "../src/lib/integration-config";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";
import type { VideoTicket } from "../src/lib/video-provider";

const base = process.env.VIDEO_TEST_BASE_URL?.replace(/\/$/, "");
test("video token API enforces membership, roles, suspension and provider setup", { skip: !base }, async () => {
  assert.equal(localDatabaseConfigured(), true, "Never run disposable auth fixtures against a hosted database.");
  const suffix = randomUUID();
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const appId = `vpaas-magic-cookie-${createHash("sha256").update(suffix).digest("hex").slice(0, 32)}`;
  const [original] = await db.select().from(siteSettings).where(eq(siteSettings.key, "integration_config")).limit(1);
  // The isolated test server and this fixture process must share the same encryption key.
  // Generating a different key here would make correctly saved credentials unreadable to the API.
  assert.ok((process.env.INTEGRATION_ENCRYPTION_KEY || process.env.SESSION_SECRET || "").length >= 32, "Share a test-only INTEGRATION_ENCRYPTION_KEY with the isolated test server.");
  const userIds: number[] = [];
  const lessonIds: number[] = [];
  try {
    const accounts = await db.insert(users).values([
      { name: "Video test teacher", email: `video-teacher-${suffix}@example.test`, passwordHash: "fixture-no-login", role: "teacher" },
      { name: "Video test student", email: `video-student-${suffix}@example.test`, passwordHash: "fixture-no-login", role: "student" },
      { name: "Video test outsider", email: `video-outsider-${suffix}@example.test`, passwordHash: "fixture-no-login", role: "student" },
      { name: "Video test admin", email: `video-admin-${suffix}@example.test`, passwordHash: "fixture-no-login", role: "admin" },
    ]).returning();
    const [teacher, student, outsider, admin] = accounts;
    userIds.push(...accounts.map(u => u.id));
    const cookies = new Map<number, string>();
    for (const account of accounts) {
      const token = randomBytes(32).toString("base64url");
      await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: account.id, expiresAt: new Date(Date.now() + 3_600_000) });
      cookies.set(account.id, `sid=${token}`);
    }
    const [lesson] = await db.insert(lessons).values({ teacherId: teacher.id, studentId: student.id, startAt: new Date(Date.now() - 5 * 60_000), duration: 50, status: "confirmed", platform: "lingo", price: 0, topic: "Disposable video access test" }).returning();
    lessonIds.push(lesson.id);
    const request = async (userId?: number, lessonId = lesson.id) => {
      const response = await fetch(`${base}/api/lessons/${lessonId}/video-token`, { method: "POST", headers: userId ? { Cookie: cookies.get(userId)! } : {}, cache: "no-store" });
      return { response, data: await response.json() as Partial<VideoTicket> & { error?: string; code?: string } };
    };
    const configure = async (mode: "jaas" | "disabled") => {
      const fd = new FormData();
      fd.set("videoProvider", mode);
      if (mode === "jaas") { fd.set("jaasAppId", appId); fd.set("jaasApiKeyId", "abc123"); fd.set("jaasPrivateKey", privateKey); }
      await saveIntegrationProvider("video", fd);
    };
    await configure("jaas");
    assert.equal((await request()).response.status, 401, "anonymous token request");
    const host = await request(teacher.id);
    assert.equal(host.response.status, 200, host.data.error);
    assert.equal(host.data.moderator, true);
    assert.equal(host.response.headers.get("cache-control"), "private, no-store");
    assert.equal(host.response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(JSON.stringify(host.data).includes("PRIVATE KEY"), false);
    const learner = await request(student.id);
    assert.equal(learner.response.status, 200, learner.data.error);
    assert.equal(learner.data.moderator, false);
    assert.equal(learner.data.roomName, host.data.roomName, "participants join the same lesson room");
    assert.notEqual(learner.data.jwt, host.data.jwt, "tokens are participant-specific");
    assert.equal((await request(outsider.id)).response.status, 403, "non-member denied");
    assert.equal((await request(admin.id)).response.status, 403, "admin cannot enter a real lesson");

    const adminPage = await fetch(`${base}/admin/integrations`, { headers: { Cookie: cookies.get(admin.id)! }, cache: "no-store" });
    assert.equal(adminPage.status, 200);
    const html = await adminPage.text();
    const privateBody = privateKey.split("\n").filter(line => !line.includes("BEGIN") && !line.includes("END")).join("").trim();
    assert.equal(html.includes(privateBody), false, "private signing key must never be serialized to admin HTML");
    assert.equal((adminPage.headers.get("content-security-policy") || "").includes("meet.jit.si"), false, "public demo must not be permitted by CSP");

    await db.update(users).set({ suspended: true }).where(eq(users.id, student.id));
    assert.equal((await request(student.id)).response.status, 401, "suspended account denied");
    await db.update(users).set({ suspended: false }).where(eq(users.id, student.id));
    await db.update(lessons).set({ status: "cancelled" }).where(eq(lessons.id, lesson.id));
    assert.equal((await request(teacher.id)).response.status, 403, "cancelled lesson denied");
    await db.update(lessons).set({ status: "confirmed", startAt: new Date(Date.now() + 2 * 60 * 60_000) }).where(eq(lessons.id, lesson.id));
    assert.equal((await request(teacher.id)).response.status, 403, "early entry denied");
    await db.update(lessons).set({ startAt: new Date(Date.now() - 5 * 60_000) }).where(eq(lessons.id, lesson.id));
    await configure("disabled");
    const disabled = await request(teacher.id);
    assert.equal(disabled.response.status, 503);
    assert.equal(disabled.data.code, "video_not_configured");
    assert.equal(disabled.data.jwt, undefined, "no anonymous public fallback");
    await configure("jaas");

    const [group] = await db.insert(lessons).values({ teacherId: teacher.id, studentId: student.id, startAt: new Date(Date.now() - 5 * 60_000), duration: 50, status: "confirmed", platform: "lingo", classType: "semi_private", capacity: 2, price: 0, topic: "[TEST] Disposable group access" }).returning();
    lessonIds.push(group.id);
    const [seat] = await db.insert(lessonParticipants).values({ lessonId: group.id, studentId: outsider.id, paidAmount: 0, status: "booked" }).returning();
    assert.equal((await request(outsider.id, group.id)).response.status, 200, "active group seat allowed");
    await db.update(lessonParticipants).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(lessonParticipants.id, seat.id));
    assert.equal((await request(outsider.id, group.id)).response.status, 403, "cancelled group seat denied");
    const sandboxAdmin = await request(admin.id, group.id);
    assert.equal(sandboxAdmin.response.status, 200, "admin allowed only in marked test lesson");
    assert.equal(sandboxAdmin.data.moderator, true);
  } finally {
    if (lessonIds.length) await db.delete(lessons).where(inArray(lessons.id, lessonIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (original) await db.insert(siteSettings).values(original).onConflictDoUpdate({ target: siteSettings.key, set: { value: original.value, updatedAt: original.updatedAt } });
    else await db.delete(siteSettings).where(eq(siteSettings.key, "integration_config"));

  }
});
test.after(async () => { await pool.end(); });
