import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, type BrowserContext } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { accountingEntries, adminAuditLogs, classroomWorkspaceStates, cryptoNetworkSettings, cryptoPaymentOrders, learningMaterials, lessons, sessions, transactions, users } from "../src/db/schema";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";

const base = (process.env.VIDEO_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
function samplePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 6 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Length 44 >>\nstream\nBT /F1 18 Tf 50 200 Td (Page One) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length 44 >>\nstream\nBT /F1 18 Tf 50 200 Td (Page Two) Tj ET\nendstream",
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((body, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const mockVideo = async (context: BrowserContext, lessonId: number) => {
  await context.route(`**/api/lessons/${lessonId}/room`, route => route.fulfill({ json: { lessonId, platform: "lingo", revision: 0, meetingUrl: "", joinUrl: "https://8x8.vc/test/room", videoProvider: "jaas", videoMessage: "", state: "open", issueReported: false, updatedAt: null } }));
  await context.route(`**/api/lessons/${lessonId}/video-token`, route => route.fulfill({ json: { domain: "8x8.vc", roomName: "test/room", jwt: "fixture-token", expiresAt: Date.now() + 900000, moderator: true, displayName: "Fixture" } }));
  await context.route("https://8x8.vc/**/external_api.js", route => route.fulfill({ contentType: "application/javascript", body: `window.JitsiMeetExternalAPI=class{constructor(domain,options){this.listeners={};this.frame=document.createElement('iframe');options.parentNode.appendChild(this.frame);setTimeout(()=>this.listeners.videoConferenceJoined&&this.listeners.videoConferenceJoined({id:'local',displayName:'Fixture'}),50);}addListener(event,callback){this.listeners[event]=callback;}executeCommand(){}getIFrame(){return this.frame;}dispose(){this.frame.remove();}};` }));
  await context.route("**/api/private-files/material/**", route => route.fulfill({ contentType: "application/pdf", body: samplePdf() }));
};

async function main() {
  assert.equal(localDatabaseConfigured(), true);
  const suffix = randomUUID(); const browser = await chromium.launch({ headless: true });
  const userIds: number[] = []; const lessonIds: number[] = []; const materialIds: number[] = [];
  const originalSettings = await db.select().from(cryptoNetworkSettings);
  try {
    const accounts = await db.insert(users).values([
      { name: "Browser teacher", email: `browser-teacher-${suffix}@example.test`, passwordHash: "fixture", role: "teacher" },
      { name: "Browser student", email: `browser-student-${suffix}@example.test`, passwordHash: "fixture", role: "student", balance: 0 },
      { name: "Browser admin", email: `browser-admin-${suffix}@example.test`, passwordHash: "fixture", role: "admin" },
    ]).returning();
    const [teacher, student, admin] = accounts; userIds.push(...accounts.map(user => user.id));
    const contexts = new Map<number, BrowserContext>();
    for (const account of accounts) {
      const token = randomBytes(32).toString("base64url");
      await db.insert(sessions).values({ id: createHash("sha256").update(token).digest("hex"), userId: account.id, expiresAt: new Date(Date.now() + 3600000) });
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await context.addCookies([{ name: "sid", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      contexts.set(account.id, context);
    }
    const [lesson] = await db.insert(lessons).values({ teacherId: teacher.id, studentId: student.id, startAt: new Date(Date.now() - 5 * 60000), duration: 50, status: "confirmed", platform: "lingo", price: 0, topic: "Browser regression lesson" }).returning(); lessonIds.push(lesson.id);
    const [material] = await db.insert(learningMaterials).values({ title: `Browser PDF ${suffix.slice(0, 8)}`, kind: "textbook", category: "general", language: "en", level: "A1", published: true, createdBy: admin.id, coverUrl: "", fileUrl: JSON.stringify({ pdfRef: `storage://lingorain-private/materials/${admin.id}/fixture.pdf`, pageCount: 2, units: [{ title: "Lesson 1", content: "Read together.", audioRef: "", imageRef: "" }] }) }).returning(); materialIds.push(material.id);

    const teacherContext = contexts.get(teacher.id)!; const studentContext = contexts.get(student.id)!; const adminContext = contexts.get(admin.id)!;
    await mockVideo(teacherContext, lesson.id); await mockVideo(studentContext, lesson.id);
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`${base}/classroom/${lesson.id}`);
    await teacherPage.getByRole("button", { name: "Enter LingoRoom" }).click({ timeout: 20000 });
    await teacherPage.getByText("Connected", { exact: true }).waitFor();
    await teacherPage.getByRole("button", { name: "Studio tools", exact: true }).click();
    await teacherPage.getByLabel("Admin teaching library").selectOption(String(material.id));
    await teacherPage.locator('canvas[role="img"]').waitFor();
    await teacherPage.waitForTimeout(1200);
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`${base}/classroom/${lesson.id}`);
    await studentPage.getByRole("button", { name: "Enter LingoRoom" }).click({ timeout: 20000 });
    await studentPage.getByText("Connected", { exact: true }).waitFor();
    await studentPage.getByRole("button", { name: "Studio tools", exact: true }).click();
    await studentPage.getByText(material.title, { exact: true }).first().waitFor();
    await studentPage.locator('canvas[role="img"]').waitFor();
    await teacherPage.getByRole("button", { name: "Next", exact: true }).click();
    await studentPage.locator('canvas[aria-label*="page 2"]').waitFor({ timeout: 15000 });
    await teacherPage.getByRole("button", { name: "Whiteboard", exact: true }).click();
    for (const width of [1024, 390]) {
      await teacherPage.setViewportSize({ width, height: 844 });
      await teacherPage.waitForTimeout(250);
      const overflow = await teacherPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 2, `classroom horizontal overflow at ${width}px: ${overflow}`);
    }
    await teacherPage.getByRole("button", { name: "Video room", exact: true }).click();
    await teacherPage.getByText("Connected", { exact: true }).waitFor();

    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${base}/admin/crypto-settings`);
    await adminPage.locator('input[name="address_usdt_trc20"]').fill("T" + "A".repeat(33));
    await adminPage.locator('input[name="direct_usdt_trc20"]').check();
    await adminPage.getByRole("button", { name: "Save all network settings" }).click();
    await adminPage.waitForURL(/result=saved/);
    const walletPage = await studentContext.newPage();
    await walletPage.goto(`${base}/dashboard?tab=wallet`);
    const createButton = walletPage.getByRole("button", { name: "Create direct transfer request" });
    await createButton.waitFor();
    await walletPage.waitForLoadState("networkidle");
    await createButton.click();
    let order: typeof cryptoPaymentOrders.$inferSelect | undefined;
    for (let attempt = 0; attempt < 24; attempt++) {
      [order] = await db.select().from(cryptoPaymentOrders).where(eq(cryptoPaymentOrders.userId, student.id)).orderBy(cryptoPaymentOrders.id).limit(1);
      if (order) break;
      if (attempt === 8) await createButton.click().catch(() => {});
      await walletPage.waitForTimeout(500);
    }
    assert.ok(order, "direct transfer request should be created by the wallet form");
    await walletPage.goto(`${base}/dashboard?tab=wallet&crypto=${order.id}`);
    await walletPage.locator('input[name="txHash"]').waitFor();
    const txHash = randomBytes(32).toString("hex");
    await walletPage.locator('input[name="txHash"]').fill(txHash);
    await walletPage.getByRole("button", { name: "Submit for admin approval" }).click();
    await walletPage.getByText("Your transfer is waiting for administrator verification.", { exact: false }).waitFor();
    await adminPage.goto(`${base}/admin/crypto-payments?status=pending_review`);
    await adminPage.locator('input[name="verifiedAmount"]').fill("20.00");
    await adminPage.locator('input[name="explorerUrl"]').fill(`https://tronscan.org/#/transaction/${txHash}`);
    await adminPage.locator('input[name="verified"]').check();
    await adminPage.getByRole("button", { name: "Approve & credit wallet once" }).click();
    await adminPage.waitForURL(/result=approved/);
    assert.equal((await db.select().from(users).where(eq(users.id, student.id)))[0].balance, 2000);
    console.log("Browser regression passed: teacher/student PDF sync, whiteboard layout, crypto settings and admin approval.");
  } finally {
    await browser.close();
    if (lessonIds.length) await db.delete(classroomWorkspaceStates).where(inArray(classroomWorkspaceStates.lessonId, lessonIds));
    if (materialIds.length) await db.delete(learningMaterials).where(inArray(learningMaterials.id, materialIds));
    if (lessonIds.length) await db.delete(lessons).where(inArray(lessons.id, lessonIds));
    await db.delete(cryptoNetworkSettings);
    if (originalSettings.length) await db.insert(cryptoNetworkSettings).values(originalSettings);
    if (userIds.length) {
      await db.delete(adminAuditLogs).where(inArray(adminAuditLogs.adminId, userIds));
      const txs = await db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.userId, userIds));
      if (txs.length) await db.delete(accountingEntries).where(inArray(accountingEntries.transactionId, txs.map(tx => tx.id)));
      await db.delete(transactions).where(inArray(transactions.userId, userIds));
      await db.delete(cryptoPaymentOrders).where(inArray(cryptoPaymentOrders.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
