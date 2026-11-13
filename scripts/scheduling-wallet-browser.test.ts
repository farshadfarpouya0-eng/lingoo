import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium, expect, type BrowserContext } from "@playwright/test";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, pool } from "../src/db";
import { users, sessions, teacherProfiles, lessons, messages, cryptoNetworkSettings, cryptoPaymentOrders, accountingEntries, transactions, adminAuditLogs, siteSettings, userPresence, lessonPlatformEvents } from "../src/db/schema";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";

const origin = "http://localhost:3000";

async function main() {
  assert.equal(localDatabaseConfigured(), true, "Regression tests must never run on a hosted database.");
  assert.ok(process.env.E2B_SANDBOX || process.env.E2B_SANDBOX_ID, "Only disposable sandbox tests are allowed.");
  const suffix = randomUUID();
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const accountIds: number[] = [];
  const errors: string[] = [];
  const networkBackup = await db.select().from(cryptoNetworkSettings);
  const [integrationBackup] = await db.select().from(siteSettings).where(eq(siteSettings.key, "integration_config"));
  const contexts: BrowserContext[] = [];
  mkdirSync("artifacts", { recursive: true });
  async function contextFor(id: number, timezoneId: string) {
    const token = randomBytes(32).toString("base64url");
    await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: id, expiresAt: new Date(Date.now() + 3600_000) });
    const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1100 }, timezoneId });
    contexts.push(context);
    await context.addCookies([{ name: "sid", value: token, url: origin }, { name: "lang", value: "en", url: origin }]);
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    return context;
  }
  try {
    const accounts = await db.insert(users).values([
      { name: "Schedule test tutor", email: `schedule-tutor-${suffix}@example.test`, passwordHash: "local-fixture-not-a-login", role: "teacher", timeZone: "Asia/Tehran" },
      { name: "Schedule test learner", email: `schedule-student-${suffix}@example.test`, passwordHash: "local-fixture-not-a-login", role: "student", timeZone: "Asia/Shanghai", balance: 10000 },
      { name: "Tokyo test learner", email: `schedule-tokyo-${suffix}@example.test`, passwordHash: "local-fixture-not-a-login", role: "student", timeZone: "Asia/Tokyo", balance: 10000 },
      { name: "Local test admin", email: `schedule-admin-${suffix}@example.test`, passwordHash: "local-fixture-not-a-login", role: "admin", timeZone: "UTC" },
    ]).returning();
    const [teacher, student, tokyo, admin] = accounts;
    accountIds.push(...accounts.map(account => account.id));
    await db.insert(teacherProfiles).values({ userId: teacher.id, headline: "A personal English lesson at your pace", bio: "Local automated test fixture for accurate lesson scheduling and privacy.", timeZone: "Asia/Tehran", startHour: 9, endHour: 18, workDays: "0,1,2,3,4,5,6", price: 2500, active: true });
    const chinaContext = await contextFor(student.id, "Asia/Tokyo"); // Browser zone must NOT override the saved account zone.
    const japanContext = await contextFor(tokyo.id, "Asia/Shanghai");
    const teacherContext = await contextFor(teacher.id, "Asia/Tehran");
    const adminContext = await contextFor(admin.id, "UTC");
    const page = await chinaContext.newPage();
    for (const [context, expectedZone, expectedStart] of [[chinaContext, "Asia/Shanghai", "13:30"], [japanContext, "Asia/Tokyo", "14:30"]] as const) {
      const p = context === chinaContext ? page : await context.newPage();
      const response = await p.goto(`${origin}/teachers/${teacher.id}`, { waitUntil: "networkidle" });
      assert.equal(response!.status(), 200);
      await expect(p.getByTestId("booking-zone")).toHaveText(expectedZone);
      assert.doesNotMatch(await p.locator("body").innerText(), /Teacher time|teacher’s local|Asia\/Tehran/);
      assert.doesNotMatch(await response!.text(), /Asia\/Tehran/);
      await p.getByTestId("booking-day").nth(1).click();
      await p.getByRole("button", { name: expectedStart, exact: true }).click();
      await expect(p.getByTestId("selected-lesson-time")).toContainText(expectedStart);
      const iso = await p.locator('input[name="startAt"]').inputValue();
      assert.equal(new Intl.DateTimeFormat("en-GB", { timeZone: expectedZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)), expectedStart);
      await p.getByRole("button", { name: "25 min", exact: true }).click();
      await p.getByTestId("booking-day").nth(1).click();
      await p.getByRole("button", { name: expectedStart, exact: true }).click();
      await expect(p.locator('input[name="duration"]')).toHaveValue("25");
      await expect(p.getByTestId("selected-lesson-time")).toContainText("25 min");
      await p.getByRole("button", { name: "50 min", exact: true }).click();
      await p.getByTestId("booking-day").nth(1).click();
      await p.getByRole("button", { name: expectedStart, exact: true }).click();
      console.log(`PASS ${expectedZone}: 25/50 minutes, correct local date and ${expectedStart}, no private teacher zone in HTML`);
    }
    await page.locator('input[name="topic"]').fill("Sandbox-only timezone regression");
    const bookedIso = await page.locator('input[name="startAt"]').inputValue();
    await page.getByRole("button", { name: "Book lesson", exact: true }).click();
    await page.waitForURL(/ok=booked/);
    const [booking] = await db.select().from(lessons).where(and(eq(lessons.studentId, student.id), eq(lessons.teacherId, teacher.id)));
    assert.equal(booking.startAt.toISOString(), bookedIso);
    assert.equal(booking.duration, 50);
    assert.doesNotMatch(await page.locator("body").innerText(), /Tehran/);
    console.log("PASS reservation persists the original UTC instant and duration; dashboard shows student time");

    // Include midnight rollover using the tutor's actual local availability, without changing any real tutor.
    await db.update(teacherProfiles).set({ endHour: 24 }).where(eq(teacherProfiles.userId, teacher.id));
    await page.goto(`${origin}/teachers/${teacher.id}`, { waitUntil: "networkidle" });
    for (let index = 0; index < Math.min(await page.getByTestId("booking-day").count(), 4); index++) {
      const day = page.getByTestId("booking-day").nth(index);
      const key = await day.getAttribute("data-date"); await day.click();
      for (const iso of await page.getByTestId("booking-time").evaluateAll(buttons => buttons.map(button => button.getAttribute("data-iso")!))) {
        const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
        const val = Object.fromEntries(parts.map(p => [p.type, p.value]));
        assert.equal(`${val.year}-${val.month}-${val.day}`, key);
      }
    }
    console.log("PASS all displayed times belong to the selected student calendar day, including after midnight");
    await page.screenshot({ path: "artifacts/student-schedule-desktop.png", fullPage: true });

    // Temporarily configure a test-only public receiving address in the LOCAL database.
    for (const asset of ["usdt_trc20", "usdt_bep20", "bnb_bep20", "trx_tron"]) {
      const enabled = asset === "usdt_bep20" || asset === "usdt_trc20";
      const address = asset === "usdt_trc20" ? `T${"1".repeat(33)}` : `0x${"1".repeat(40)}`;
      await db.insert(cryptoNetworkSettings).values({ asset, directEnabled: enabled, nowpaymentsEnabled: false, plisioEnabled: false, receiveAddress: address })
        .onConflictDoUpdate({ target: cryptoNetworkSettings.asset, set: { directEnabled: enabled, nowpaymentsEnabled: false, plisioEnabled: false, receiveAddress: address } });
    }
    await page.goto(`${origin}/dashboard?tab=wallet`, { waitUntil: "networkidle" });
    const checkout = page.getByTestId("crypto-checkout");
    await expect(checkout.getByRole("heading", { name: "How much would you like to add?" })).toBeVisible();
    await checkout.getByRole("button", { name: /USDT.*BNB Smart Chain/ }).click();
    await checkout.screenshot({ path: "artifacts/crypto-step-1.png" });
    const [balanceBefore] = await db.select({ balance: users.balance }).from(users).where(eq(users.id, student.id));
    await checkout.getByRole("button", { name: "Continue to payment", exact: true }).click();
    await expect(page.getByTestId("crypto-exact-amount")).toContainText("20.00");
    await expect(page.getByTestId("crypto-receiving-address")).toHaveText(`0x${"1".repeat(40)}`);
    await checkout.screenshot({ path: "artifacts/crypto-step-2.png" });
    await page.evaluate(`
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function () { return Promise.reject(new DOMException("Test denied", "NotAllowedError")); } } });
      Object.defineProperty(Document.prototype, "execCommand", { configurable: true, value: function () { return false; } });
    `);
    await checkout.getByRole("button", { name: "Copy address", exact: true }).click();
    await expect(checkout.getByLabel("Automatic copying is unavailable. Select and copy the text below.")).toHaveValue(`0x${"1".repeat(40)}`);
    console.log("PASS blocked clipboard offers the exact receiving address for manual copying");
    const [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.userId, student.id));
    assert.equal(order.method, "direct"); assert.equal(order.asset, "usdt_bep20");
    assert.equal((await db.select({ balance: users.balance }).from(users).where(eq(users.id, student.id)))[0].balance, balanceBefore.balance);
    assert.equal((await japanContext.request.post(`/api/crypto/orders/${order.id}/proof`, { data: { txHash: "f".repeat(64) } })).ok(), false);
    await checkout.locator('input[type="checkbox"]').check();
    await checkout.getByRole("button", { name: "I’ve sent the payment", exact: true }).click();
    await checkout.getByLabel("Transaction ID", { exact: true }).fill("not-a-hash");
    await checkout.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(checkout.getByRole("alert")).toContainText("64-character");
    const hash = randomBytes(32).toString("hex");
    await checkout.getByLabel("Transaction ID", { exact: true }).fill(hash);
    await checkout.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(checkout.getByRole("heading", { name: "Your transfer is being reviewed" })).toBeVisible();
    const [submitted] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.id, order.id));
    assert.equal(submitted.status, "pending_review");
    assert.equal((await db.select({ balance: users.balance }).from(users).where(eq(users.id, student.id)))[0].balance, balanceBefore.balance);
    await checkout.screenshot({ path: "artifacts/crypto-step-3-review.png" });
    console.log("PASS real request/proof API: amount/network persisted; invalid hash and foreign-account proof rejected; no credit before approval");

    // Exercise the real admin workflow using a deliberately synthetic local fixture; no real transfer or explorer request is made.
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${origin}/admin/crypto-payments?status=pending_review`);
    const article = adminPage.locator("article").filter({ hasText: student.email });
    const approval = article.locator('form:has(input[name="verifiedAmount"])');
    await approval.locator('input[name="verifiedAmount"]').fill("20.00");
    await approval.locator('input[name="explorerUrl"]').fill(`https://bscscan.com/tx/${submitted.txHash}`);
    await approval.locator('input[name="note"]').fill("SANDBOX TEST ONLY — synthetic transaction, not a real on-chain payment");
    await approval.locator('input[name="verified"]').check();
    const replay = await approval.evaluate(form => [...new FormData(form as HTMLFormElement).entries()].map(([key, value]) => [key, String(value)]));
    await approval.getByRole("button", { name: "Approve & credit wallet once" }).click();
    await adminPage.waitForURL(/result=approved/);
    assert.equal((await db.select({ balance: users.balance }).from(users).where(eq(users.id, student.id)))[0].balance, balanceBefore.balance + 2000);
    await adminPage.evaluate(async fields => { const data = new FormData(); fields.forEach(([key, value]) => data.append(key, value)); await fetch("/admin/crypto-payments", { method: "POST", body: data }); }, replay);
    assert.equal((await db.select({ balance: users.balance }).from(users).where(eq(users.id, student.id)))[0].balance, balanceBefore.balance + 2000);
    await checkout.getByRole("button", { name: "Check payment status", exact: true }).click();
    await expect(checkout.getByRole("heading", { name: "Your wallet has been topped up" })).toBeVisible();
    await checkout.screenshot({ path: "artifacts/crypto-step-3-paid.png" });
    console.log("PASS admin approval credits once; replay is harmless; student confirmation and balance refresh only after server approval");

    const [expired] = await db.insert(cryptoPaymentOrders).values({ userId: student.id, method: "direct", provider: "direct", asset: "usdt_bep20", network: "BNB Smart Chain · BEP20", amountUsd: 2000, payAmount: "20.00", payAddress: `0x${"1".repeat(40)}`, status: "awaiting_payment", expiresAt: new Date(Date.now() - 60000) }).returning();
    await page.goto(`${origin}/dashboard?tab=wallet&crypto=${expired.id}`);
    await expect(checkout.getByRole("heading", { name: "This payment quote has expired" })).toBeVisible();
    await expect(checkout.getByTestId("crypto-receiving-address")).toHaveCount(0);
    await expect(checkout.getByRole("button", { name: "I’ve sent the payment" })).toHaveCount(0);
    await expect(checkout).toContainText("Do not pay a second time.");
    console.log("PASS expired quote hides sending controls and gives safe already-paid guidance");

    for (const lang of ["en", "zh", "ja"]) {
      await chinaContext.addCookies([{ name: "lang", value: lang, url: origin }]);
      for (const width of [320, 390, 1024]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const path of [`/teachers/${teacher.id}`, "/dashboard?tab=wallet"]) {
          await page.goto(origin + path, { waitUntil: "networkidle" });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${lang} ${width} ${path}: overflow`);
        }
      }
    }
    await chinaContext.addCookies([{ name: "lang", value: "en", url: origin }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/dashboard?tab=wallet`);
    await page.getByTestId("crypto-checkout").screenshot({ path: "artifacts/crypto-mobile.png" });
    console.log("PASS wallet and schedule in EN/ZH/JA at desktop and mobile widths");

    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`${origin}/dashboard?tab=profile`);
    await expect(teacherPage.locator('select[name="teacherTimeZone"]')).toHaveValue("Asia/Tehran");
    await teacherPage.locator('input[name="startHour"]').fill("0");
    await teacherPage.locator('#profile-form button').click();
    await teacherPage.waitForURL(/ok=saved/);
    const [savedTeacher] = await db.select().from(teacherProfiles).where(eq(teacherProfiles.userId, teacher.id));
    assert.equal(savedTeacher.startHour, 0); assert.equal(savedTeacher.timeZone, "Asia/Tehran");
    console.log("PASS saving a tutor profile keeps Tehran and midnight (00:00) unchanged");

    // Saved custom hostname must affect response headers without adding a host env var.
    const current = (integrationBackup?.value || {}) as { publicConfig?: Record<string, string>; encryptedSecrets?: Record<string, string> };
    await db.insert(siteSettings).values({ key: "integration_config", value: { version: 1, publicConfig: { ...current.publicConfig, jitsiDomain: "video.school.example" }, encryptedSecrets: current.encryptedSecrets || {} } }).onConflictDoUpdate({ target: siteSettings.key, set: { value: { version: 1, publicConfig: { ...current.publicConfig, jitsiDomain: "video.school.example" }, encryptedSecrets: current.encryptedSecrets || {} } } });
    const response = await adminContext.request.get("/admin/integrations");
    assert.match(response.headers()["content-security-policy"], /https:\/\/video\.school\.example/);
    assert.match(response.headers()["permissions-policy"], /https:\/\/video\.school\.example/);
    const entryResponse = await chinaContext.request.get("/");
    assert.ok(entryResponse.headers()["content-security-policy"].includes("https://video.school.example"), "SPA entry documents must allow the saved video host");
    assert.equal((await chinaContext.request.post("/api/admin/video-check")).status(), 403);
    console.log("PASS admin-saved video host is allowed by runtime CSP/camera policy; diagnostics denied to students");

    const [liveLesson] = await db.insert(lessons).values({ teacherId: teacher.id, studentId: student.id, startAt: new Date(Date.now() - 5 * 60000), duration: 50, status: "confirmed", platform: "lingo", price: 0, topic: "[TEST] Local SDK transport fixture" }).returning();
    assert.equal((await japanContext.request.post(`/api/lessons/${liveLesson.id}/video-token`)).status(), 403);
    const appId = `vpaas-magic-cookie-${"c".repeat(32)}`;
    const sdkUrl = `https://8x8.vc/${appId}/external_api.js`;
    let sdkRequested = false;
    const videoPage = await chinaContext.newPage();
    await videoPage.route(`**/api/lessons/${liveLesson.id}/room`, route => route.fulfill({ json: { lessonId: liveLesson.id, platform: "lingo", revision: 1, meetingUrl: "", joinUrl: "", videoProvider: "jaas", videoIssue: "ready", videoMessage: "", state: "open", issueReported: false, updatedAt: null } }));
    await videoPage.route(`**/api/lessons/${liveLesson.id}/video-token`, route => route.fulfill({ json: { domain: "8x8.vc", roomName: `${appId}/fixture`, jwt: "test-only-browser-transport-token", moderator: false, displayName: student.name, expiresAt: Date.now() + 60000 } }));
    await videoPage.route(sdkUrl, route => { sdkRequested = true; return route.fulfill({ contentType: "application/javascript", body: `window.JitsiMeetExternalAPI=class{constructor(domain,options){this.listeners={};this.frame=document.createElement('iframe');this.frame.title='Mock video transport';options.parentNode.appendChild(this.frame);setTimeout(()=>this.listeners.videoConferenceJoined?.({id:'local-test'}),40);}addListener(event,callback){this.listeners[event]=callback;}getIFrame(){return this.frame;}executeCommand(){}dispose(){this.frame.remove();}};` }); });
    await videoPage.goto(`${origin}/classroom/${liveLesson.id}?join=1`);
    await videoPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(videoPage.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
    assert.equal(sdkRequested, true);
    console.log("PASS classroom fetches AppID-scoped JaaS API and handles joined event (MOCKED transport; not a live provider call)");
    const privatePage = await chinaContext.newPage();
    await privatePage.route(`**/api/lessons/${liveLesson.id}/room`, route => route.fulfill({ json: { lessonId: liveLesson.id, platform: "lingo", revision: 2, meetingUrl: "", joinUrl: "", videoProvider: "self-hosted", videoIssue: "ready", videoMessage: "", state: "open", issueReported: false, updatedAt: null } }));
    await privatePage.route(`**/api/lessons/${liveLesson.id}/video-token`, route => route.fulfill({ json: { domain: "video.school.example", roomName: "fixture", jwt: "test-only-browser-transport-token", moderator: false, displayName: student.name, expiresAt: Date.now() + 60000 } }));
    let privateSdkRequested = false;
    await privatePage.route("https://video.school.example/external_api.js", route => { privateSdkRequested = true; return route.fulfill({ contentType: "application/javascript", body: `window.JitsiMeetExternalAPI=class{constructor(domain,options){this.listeners={};this.frame=document.createElement('iframe');options.parentNode.appendChild(this.frame);setTimeout(()=>this.listeners.videoConferenceJoined?.({id:'local-test'}),40);}addListener(event,callback){this.listeners[event]=callback;}getIFrame(){return this.frame;}executeCommand(){}dispose(){this.frame.remove();}};` }); });
    await privatePage.goto(origin + "/");
    await privatePage.locator(".site-desktop-nav").getByRole("link", { name: "Dashboard", exact: true }).click();
    await privatePage.waitForURL(/dashboard/);
    await privatePage.getByRole("link", { name: "Enter classroom", exact: true }).first().click();
    await privatePage.waitForURL(/classroom/);
    await privatePage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(privatePage.getByText("Connected", { exact: true })).toBeVisible({ timeout: 20000 });
    assert.ok(privateSdkRequested);
    console.log("PASS private video host after homepage → dashboard → classroom client navigation (MOCKED transport)");

    assert.deepEqual(errors, []);
    console.log("PASS no browser runtime errors");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await browser.close();
    await db.transaction(async tx => {
      await tx.delete(cryptoNetworkSettings);
      if (networkBackup.length) await tx.insert(cryptoNetworkSettings).values(networkBackup);
      if (integrationBackup) await tx.insert(siteSettings).values(integrationBackup).onConflictDoUpdate({ target: siteSettings.key, set: { value: integrationBackup.value, updatedAt: integrationBackup.updatedAt } });
      else await tx.delete(siteSettings).where(eq(siteSettings.key, "integration_config"));
      if (accountIds.length) {
        await tx.delete(adminAuditLogs).where(or(inArray(adminAuditLogs.adminId, accountIds), inArray(adminAuditLogs.targetUserId, accountIds)));
        await tx.delete(accountingEntries).where(inArray(accountingEntries.userId, accountIds));
        await tx.delete(transactions).where(inArray(transactions.userId, accountIds));
        await tx.delete(messages).where(or(inArray(messages.fromId, accountIds), inArray(messages.toId, accountIds)));
        await tx.delete(lessonPlatformEvents).where(inArray(lessonPlatformEvents.changedBy, accountIds));
        await tx.delete(lessons).where(or(inArray(lessons.studentId, accountIds), inArray(lessons.teacherId, accountIds)));
        await tx.delete(cryptoPaymentOrders).where(inArray(cryptoPaymentOrders.userId, accountIds));
        await tx.delete(userPresence).where(inArray(userPresence.userId, accountIds));
        await tx.delete(users).where(inArray(users.id, accountIds));
      }
    });
    await pool.end();
    console.log("Cleanup complete: temporary accounts, transactions and settings removed/restored. No hosted database was accessed.");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
