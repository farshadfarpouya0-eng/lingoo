import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, pool } from "../src/db";
import { users, sessions, teacherProfiles, lessons, lessonPlatformEvents, transactions, accountingEntries, userPresence } from "../src/db/schema";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";
import { buildSlots } from "../src/lib/time";
import { reserveLesson } from "../src/lib/lesson-service";
import { chooseClassroom } from "../src/lib/room-service";

const origin = "http://localhost:3000";
async function main() {
  assert.ok(localDatabaseConfigured() && (process.env.E2B_SANDBOX || process.env.E2B_SANDBOX_ID), "This test can run ONLY in a disposable local sandbox.");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const contexts = [] as Awaited<ReturnType<typeof browser.newContext>>[];
  const created: number[] = [];
  try {
    const suffix = randomUUID();
    const [teacher, student] = await db.insert(users).values([
      { name: "Entry window tutor", email: `entry-teacher-${suffix}@example.test`, passwordHash: "test-only", role: "teacher", timeZone: "Asia/Tehran" },
      { name: "Entry window learner", email: `entry-student-${suffix}@example.test`, passwordHash: "test-only", role: "student", timeZone: "Asia/Shanghai", balance: 10000 },
    ]).returning();
    created.push(teacher.id, student.id);
    await db.insert(teacherProfiles).values({ userId: teacher.id, timeZone: "Asia/Tehran", startHour: 9, endHour: 21, workDays: "0,1,2,3,4,5,6", price: 2500, meetUrl: "https://meet.google.com/abc-defg-hij", meetOpenAccess: true, active: true });
    const slots = buildSlots("en", { timeZone: "Asia/Tehran", startHour: 9, endHour: 21, workDays: "0,1,2,3,4,5,6" }, new Set(), 50);
    const startAt = new Date(slots.find(day => day.slots.length && Date.parse(day.slots[0].iso) > Date.now() + 90 * 60_000)!.slots[0].iso);
    const booked = await reserveLesson(student.id, { teacherId: teacher.id, startAt, duration: 50, topic: "Sandbox-only classroom entry test" });
    const id = booked.id;
    const [record] = await db.select().from(lessons).where(eq(lessons.id, id));
    assert.equal(record.status, "pending"); assert.equal(record.platform, "undecided");

    const makeContext = async (userId: number) => {
      const token = randomBytes(32).toString("base64url");
      await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId, expiresAt: new Date(Date.now() + 3600_000) });
      const context = await browser.newContext({ baseURL: origin, viewport: { width: 1366, height: 900 } });
      contexts.push(context);
      await context.addCookies([{ name: "sid", value: token, url: origin }, { name: "lang", value: "en", url: origin }]);
      return context;
    };
    const tutorContext = await makeContext(teacher.id);
    const learnerContext = await makeContext(student.id);
    const learner = await learnerContext.newPage();
    const tutor = await tutorContext.newPage();
    const room = (context: typeof tutorContext) => context.request.get(`/api/lessons/${id}/room`);
    const info = async (context: typeof tutorContext) => (await room(context)).json() as Promise<{ state: string; platform: string; confirmed: boolean; joinUrl: string }>;
    const direct = async () => learnerContext.request.get(`/classroom/${id}`, { maxRedirects: 0 });
    const expectEntryDenied = async () => {
      await learner.goto(`${origin}/classroom/${id}`);
      await learner.waitForURL(/\/dashboard\?tab=lessons/, { timeout: 15000 });
      await expect(learner.locator('iframe[title="Lingorain live classroom"]')).toHaveCount(0);
    };
    await learner.goto(`${origin}/dashboard?tab=lessons`);
    await expect(learner.locator("article").filter({ hasText: teacher.name })).toContainText("Awaiting tutor confirmation");
    await expect(learner.locator(`a[href^="/classroom/${id}"]`)).toHaveCount(0);
    assert.deepEqual({ state: (await info(learnerContext)).state, confirmed: (await info(learnerContext)).confirmed }, { state: "pending", confirmed: false });
    assert.equal((await room(learnerContext)).status(), 200);
    assert.equal((await learnerContext.request.post(`/api/lessons/${id}/video-token`)).status(), 403);
    assert.equal((await tutorContext.request.post(`/api/lessons/${id}/teacher-launch`)).status(), 403);
    await expectEntryDenied();
    await assert.rejects(chooseClassroom(teacher.id, id, "meet", ""), /confirm_first/);
    await tutor.goto(`${origin}/classroom/${id}`);
    await expect(tutor.getByRole("heading", { name: "First, confirm this booking" })).toBeVisible();
    await expect(tutor.getByRole("button", { name: "Save classroom" })).toHaveCount(0);
    console.log("PASS booking stays pending: no student link, no direct URL, no token, no tutor launch or room selection");

    // Simulate an older pending record with a preselected platform: confirmation must reset it.
    await db.update(lessons).set({ platform: "meet", meetingUrl: "https://meet.google.com/abc-defg-hij" }).where(eq(lessons.id, id));
    assert.equal((await info(learnerContext)).platform, "undecided");
    await tutor.goto(`${origin}/dashboard?tab=lessons`);
    const row = tutor.locator("article").filter({ hasText: student.name });
    await row.locator('button[name="action"][value="confirm"]').click();
    await expect.poll(async () => (await db.select({ status: lessons.status }).from(lessons).where(eq(lessons.id, id)))[0].status).toBe("confirmed");
    const [afterConfirm] = await db.select().from(lessons).where(eq(lessons.id, id));
    assert.equal(afterConfirm.platform, "undecided"); assert.equal(afterConfirm.meetingUrl, "");
    await learner.reload();
    await expect(learner.locator("article").filter({ hasText: teacher.name })).toContainText("Waiting for tutor to choose the classroom");
    await expect(learner.locator(`a[href^="/classroom/${id}"]`)).toHaveCount(0);
    await tutor.goto(`${origin}/classroom/${id}`);
    await expect(tutor.getByRole("button", { name: "Save classroom" })).toBeVisible();
    await tutor.getByRole("button", { name: /Google Meet/ }).first().click();
    await tutor.getByRole("button", { name: "Save classroom" }).click();
    await expect.poll(async () => (await db.select({ platform: lessons.platform }).from(lessons).where(eq(lessons.id, id)))[0].platform).toBe("meet");
    assert.equal((await info(learnerContext)).state, "early");
    assert.equal((await info(learnerContext)).joinUrl, "");
    assert.equal((await learnerContext.request.post(`/api/lessons/${id}/video-token`)).status(), 403);
    await expectEntryDenied();
    console.log("PASS tutor confirmation resets old platform; tutor explicitly selects room; learner still cannot enter early");

    const setStart = async (minutes: number) => {
      await db.update(lessons).set({ startAt: new Date(Date.now() + minutes * 60_000) }).where(eq(lessons.id, id));
    };
    await setStart(31);
    assert.equal((await info(tutorContext)).state, "early");
    assert.equal((await tutorContext.request.post(`/api/lessons/${id}/teacher-launch`)).status(), 403);
    await setStart(29);
    assert.equal((await info(tutorContext)).state, "open");
    assert.equal((await info(learnerContext)).state, "early");
    assert.equal((await learnerContext.request.post(`/api/lessons/${id}/teacher-launch`)).status(), 403);
    const host = await tutorContext.request.post(`/api/lessons/${id}/teacher-launch`);
    assert.equal(host.status(), 200);
    assert.equal((await host.json()).url, "https://meet.google.com/abc-defg-hij");
    await setStart(11);
    assert.equal((await info(learnerContext)).state, "early");
    await expectEntryDenied();
    await setStart(9);
    const learnerRoom = await info(learnerContext);
    assert.equal(learnerRoom.state, "open");
    assert.equal(learnerRoom.joinUrl, "https://meet.google.com/abc-defg-hij");
    await learner.reload();
    await expect(learner.locator(`a[href="/classroom/${id}?join=1"]`)).toHaveCount(1);
    assert.equal((await direct()).status(), 200);
    console.log("PASS tutor entry opens 30 minutes before; learner entry opens only 10 minutes before, including direct URL/API checks");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await browser.close();
    if (created.length) await db.transaction(async tx => {
      await tx.delete(accountingEntries).where(inArray(accountingEntries.userId, created));
      await tx.delete(transactions).where(inArray(transactions.userId, created));
      await tx.delete(lessonPlatformEvents).where(inArray(lessonPlatformEvents.changedBy, created));
      await tx.delete(lessons).where(or(inArray(lessons.studentId, created), inArray(lessons.teacherId, created)));
      await tx.delete(userPresence).where(inArray(userPresence.userId, created));
      await tx.delete(users).where(inArray(users.id, created));
    });
    await pool.end();
    console.log("PASS temporary entry-window accounts and booking cleaned from local sandbox");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
