// Run against the managed local production preview only: npx tsx scripts/placement-checkout-regression.ts
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { chromium, expect, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { accountingEntries, assessments, lessonPackages, lessonParticipants, lessons, teacherProfiles, transactions, users } from "../src/db/schema";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";
import { confirmPlacementTutor, getLatestAssessment } from "../src/lib/placement";
import { purchaseLessonPackage } from "../src/lib/package-service";
import { reserveLesson, changeLessonStatus } from "../src/lib/lesson-service";
import { hashPassword } from "../src/lib/auth";
import { getPricingConfig } from "../src/lib/pricing-config";
import { quotePackage } from "../src/lib/package-pricing";

const origin = "http://localhost:3000";
async function run() {
  assert.ok(localDatabaseConfigured() && (process.env.E2B_SANDBOX || process.env.E2B_SANDBOX_ID), "Only a disposable local preview is allowed");
  const browser = await chromium.launch({ headless: true });
  const ids: number[] = [];
  try {
    const suffix = randomUUID(), password = randomBytes(24).toString("base64url"), passwordHash = hashPassword(password);
    const [student, other, tutorA, tutorB, legacy] = await db.insert(users).values([
      { name: "Test learner", role: "student" }, { name: "Second learner", role: "student" },
      { name: "Alina Course Tutor", role: "teacher" }, { name: "Ravi Course Tutor", role: "teacher" },
      { name: "Former Tutor", role: "teacher" },
    ].map((x, i) => ({ ...x, email: `placement-${i}-${suffix}@example.test`, passwordHash, emailVerified: true, nativeLang: "en", timeZone: "UTC", balance: 1_000_000 }))).returning();
    ids.push(student.id, other.id, tutorA.id, tutorB.id, legacy.id);
    await db.insert(teacherProfiles).values([tutorA, tutorB, legacy].map(t => ({ userId: t.id, active: true,
      levels: t.id === legacy.id ? "C1" : "A1,A2,B1,B2,C1", tags: t.id === legacy.id ? "Grammar" : "Interview,TOEFL",
      startHour: 0, endHour: 24, workDays: "0,1,2,3,4,5,6", timeZone: "UTC", speaks: "English", rating: 5, reviewsCount: 100 })));
    const pricing = await getPricingConfig();
    const plan = quotePackage(pricing.student50, 50, 5, pricing.student25);
    const buy = (tid: number) => purchaseLessonPackage(student.id, { teacherId: tid, count: 5, duration: 50, expectedTotal: plan.totalPrice, purchaseKey: randomUUID() });
    const startAt = new Date(Date.now() + 3 * 86400_000); startAt.setUTCHours(13, 0, 0, 0);
    const book = (tid: number) => reserveLesson(student.id, { teacherId: tid, duration: 50, startAt });
    const balance = async () => (await db.select({ balance: users.balance }).from(users).where(eq(users.id, student.id)))[0].balance;
    const before = await balance();
    const auth = async (email: string) => {
      const context = await browser.newContext({ baseURL: origin, locale: "en-US", viewport: { width: 1100, height: 850 } });
      await context.addCookies([{ name: "lang", value: "en", url: origin }]);
      await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const p = await context.newPage(); p.setDefaultTimeout(20_000);
      await p.goto("/login"); const form = p.locator('form').filter({ has: p.locator('input[name="password"]') });
      await form.locator('[name="email"]').fill(email); await form.locator('[name="password"]').fill(password);
      await form.getByRole("button", { name: "Log in", exact: true }).click(); await p.waitForURL(/\/dashboard(?:\?|$)/);
      return p;
    };
    const page = await auth(student.email);
    const shop = `/dashboard?tab=packages&teacher=${legacy.id}`; // old bookmarks must not override placement
    async function gated(step: string) {
      await page.goto(shop); await expect(page.getByTestId("package-placement-gate")).toHaveAttribute("data-step", step);
      await expect(page.getByTestId("package-confirmed-tutor")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Choose your teacher" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Get this package" })).toHaveCount(0);
    }
    async function chooseFromResult(p: Page, name: string, id: number) {
      await p.goto("/assessment/results");
      await p.locator("article").filter({ has: p.getByRole("heading", { name, exact: true }) })
        .getByRole("button", { name: `Choose ${name.split(" ")[0]}`, exact: true }).click();
      await p.waitForURL(`**/teachers/${id}`);
      await expect(p.getByRole("form", { name: "Book a lesson" })).toBeVisible();
    }
    await gated("assessment");
    await db.insert(lessons).values([tutorA, legacy].map(t => ({ studentId: student.id, teacherId: t.id, duration: 50,
      price: 2500, status: "completed", startAt: new Date(Date.now() - 4 * 86400_000) })));
    await gated("assessment");
    await assert.rejects(buy(legacy.id), /placement_required/); await assert.rejects(book(tutorA.id), /placement_required/);
    assert.equal(await balance(), before);
    console.log("PASS: both fresh learners and a learner with two previous tutors see the placement gate; history/URL isn't a selection.");

    // An already paid package must remain usable, but cannot unlock new spending.
    const [old] = await db.insert(lessonPackages).values({ studentId: student.id, teacherId: legacy.id, duration: 25,
      totalLessons: 5, remainingLessons: 2, unitPrice: 900, originalUnitPrice: 1000, totalPrice: 4500, discountPercent: 10, purchaseKey: randomUUID() }).returning();
    await gated("assessment");
    await page.getByRole("button", { name: /My packages/ }).click();
    await page.getByRole("link", { name: "Book from package", exact: true }).click();
    await expect(page.getByTestId("owned-credit-only")).toBeVisible();
    await expect(page.getByRole("option", { name: "Pay from wallet" })).toHaveCount(0);
    await assert.rejects(buy(legacy.id), /placement_required/);
    await assert.rejects(reserveLesson(other.id, { teacherId: legacy.id, duration: 25, startAt, packageId: old.id }), /credit/);
    await assert.rejects(reserveLesson(student.id, { teacherId: tutorA.id, duration: 25, startAt, packageId: old.id }), /credit/);
    await assert.rejects(reserveLesson(student.id, { teacherId: legacy.id, duration: 50, startAt, packageId: old.id }), /credit/);
    await reserveLesson(student.id, { teacherId: legacy.id, duration: 25, startAt, packageId: old.id });
    assert.equal((await db.select().from(lessonPackages).where(eq(lessonPackages.id, old.id)))[0].remainingLessons, 1);
    assert.equal(await balance(), before);
    console.log("PASS: owned credits redeem for the original tutor/duration only; no cash taken or new purchase permission granted.");

    // Use the real written test and real confirmation form, not a mock assignment.
    await page.goto("/assessment/test"); await page.getByRole("button", { name: "Interview", exact: true }).click();
    await page.getByRole("button", { name: "Start the written test", exact: true }).click();
    for (let i = 1; i <= 15; i++) {
      await expect(page.getByText(`Question ${i} of 15`, { exact: true })).toBeVisible();
      await page.locator('main button[aria-pressed]').first().click();
      await page.getByRole("button", { name: i === 15 ? "See my result" : "Next", exact: true }).click();
    }
    await page.waitForURL("**/assessment/results");
    const written = await getLatestAssessment(student.id);
    assert.ok(written && written.status === "completed" && written.level && Array.isArray(written.recommendedIds));
    assert.ok(written.recommendedIds.includes(tutorA.id) && written.recommendedIds.includes(tutorB.id));
    assert.equal(written.selectedTeacherId, null);
    await gated("results"); await assert.rejects(buy(tutorB.id), /placement_required/); await assert.rejects(book(tutorA.id), /placement_required/);
    assert.equal(await confirmPlacementTutor(other.id, written.id, tutorA.id), false);
    assert.equal(await confirmPlacementTutor(student.id, written.id, legacy.id), false);
    await page.goto(`/teachers/${tutorB.id}`); await expect(page.getByTestId("profile-awaiting-selection")).toBeVisible();
    await expect(page.getByRole("form", { name: "Book a lesson" })).toHaveCount(0);
    await chooseFromResult(page, tutorA.name, tutorA.id);
    await page.goto(shop);
    await expect(page.getByTestId("package-confirmed-tutor")).toHaveAttribute("data-tutor-id", String(tutorA.id));
    await expect(page.getByText(tutorB.name, { exact: true })).toHaveCount(0);
    await expect(page.getByText(legacy.name, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("package-confirmed-tutor").locator('button,select,input[type="radio"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Choose your teacher" })).toHaveCount(0);
    await assert.rejects(buy(tutorB.id), /placement_required/); await assert.rejects(book(tutorB.id), /placement_required/);
    assert.equal(await balance(), before);
    await page.getByRole("button", { name: "Get this package", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm purchase" }).click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Book from package" })).toBeVisible();
    const [purchased] = await db.select().from(lessonPackages).where(and(eq(lessonPackages.studentId, student.id), eq(lessonPackages.teacherId, tutorA.id)));
    assert.ok(purchased && purchased.totalLessons === 10 && purchased.duration === 50);
    assert.equal(await balance(), before - purchased.totalPrice);
    const paidStart = new Date(startAt.getTime() + 86400_000);
    await reserveLesson(student.id, { teacherId: tutorA.id, startAt: paidStart, duration: 25 });
    assert.equal(await balance(), before - purchased.totalPrice - pricing.student25);
    console.log("PASS: written test → shortlist → explicit choice → one read-only tutor → real package purchase and single lesson.");

    // A live assessor is not an assigned course teacher. A retest invalidates stale result forms.
    const [session] = await db.insert(lessons).values({ studentId: student.id, teacherId: tutorB.id, duration: 25,
      price: 0, status: "confirmed", startAt: new Date(Date.now() - 31 * 60_000), placementAssessment: true }).returning();
    const [live] = await db.insert(assessments).values({ studentId: student.id, assignedTeacherId: tutorB.id, lessonId: session.id,
      scheduledAt: session.startAt, method: "live", status: "scheduled", goal: "Interview", audience: "adults" }).returning();
    await gated("waiting"); await assert.rejects(buy(tutorB.id), /placement_required/); await assert.rejects(book(tutorA.id), /placement_required/);
    assert.equal(await confirmPlacementTutor(student.id, written.id, tutorA.id), false);
    const teacherPage = await auth(tutorB.email);
    await expect(teacherPage.getByText("End the assessment lesson before saving the evaluation.")).toBeVisible();
    assert.equal(await changeLessonStatus(tutorB.id, session.id, "complete"), true);
    await teacherPage.reload(); const evalForm = teacherPage.locator("form").filter({ has: teacherPage.locator('select[name="level"]') });
    await evalForm.locator("select").selectOption("A1"); await evalForm.getByRole("button", { name: /Save evaluation/ }).click();
    await teacherPage.waitForURL(/ok=evaluated/);
    await gated("results"); assert.equal((await getLatestAssessment(student.id))?.id, live.id);
    await chooseFromResult(page, tutorB.name, tutorB.id); await page.goto(shop);
    await expect(page.getByTestId("package-confirmed-tutor")).toHaveAttribute("data-tutor-id", String(tutorB.id));
    await assert.rejects(buy(tutorA.id), /placement_required/);
    await db.update(teacherProfiles).set({ active: false }).where(eq(teacherProfiles.userId, tutorB.id));
    await gated("results"); await assert.rejects(buy(tutorB.id), /plan/);
    assert.equal(await confirmPlacementTutor(student.id, live.id, tutorB.id), false);
    console.log("PASS: live assessment/evaluator does not unlock checkout, grading still requires confirmation, inactive tutor not bookable.");
  } finally {
    await browser.close();
    if (ids.length) await db.transaction(async tx => {
      await tx.delete(accountingEntries).where(inArray(accountingEntries.userId, ids));
      await tx.delete(transactions).where(inArray(transactions.userId, ids));
      await tx.delete(assessments).where(inArray(assessments.studentId, ids));
      await tx.delete(lessonParticipants).where(inArray(lessonParticipants.studentId, ids));
      await tx.delete(lessons).where(inArray(lessons.studentId, ids));
      await tx.delete(lessonPackages).where(inArray(lessonPackages.studentId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
    });
    await pool.end();
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
