import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const input = process.argv[2];
if (!input) throw new Error("Supply the exact public preview origin to test.");
const origin = new URL(input).origin;
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: false });
mkdirSync("artifacts", { recursive: true });
try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find an English tutor", { timeout: 20000 });
  const hero = page.locator('img[data-hero-image="adult"]');
  await expect(hero).toBeVisible();
  await expect.poll(async () => hero.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: "artifacts/current-public-home.png", fullPage: true });
  console.log("PASS browser: homepage, JavaScript hydration and hero image on the exact public domain");
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill("student@demo.com");
  await page.locator('input[name="password"]').fill("demo1234");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await expect(page.getByRole("heading", { name: "More lessons. More progress." })).toBeVisible({ timeout: 15000 });
  console.log("PASS browser: actual student login, session cookie and package dashboard on the public domain");
  await page.getByRole("link", { name: "Lessons", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upcoming lessons", exact: true })).toBeVisible();
  console.log("PASS browser: authenticated lessons navigation");
  assert.deepEqual(errors, [], `Browser errors: ${errors.join("; ")}`);
  const embedded = await context.newPage();
  const shell = "https://lingorain-preview-shell.test/";
  await embedded.route(shell, route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><title>Preview container</title></head><body style="margin:0"><iframe id="preview" src="${origin}/" style="border:0;width:100vw;height:100vh"></iframe></body></html>` }));
  await embedded.goto(shell, { waitUntil: "domcontentloaded" });
  await expect(embedded.frameLocator("#preview").getByRole("heading", { level: 1 })).toContainText("Find an English tutor", { timeout: 30000 });
  await embedded.screenshot({ path: "artifacts/current-embedded-preview.png" });
  console.log("PASS browser: homepage also renders inside the builder's cross-origin preview frame");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find an English tutor");
  await page.screenshot({ path: "artifacts/current-public-mobile.png", fullPage: true });
  console.log(`PASS browser: mobile homepage is visible at ${origin}`);
  const separate = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "en-US", timezoneId: "Asia/Tokyo" });
  try {
    const clean = await separate.newPage();
    const freshErrors = [];
    clean.on("pageerror", error => freshErrors.push(error.message));
    const response = await clean.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    assert.equal(response?.status(), 200);
    // This context is a new visitor with no builder, Cloudflare or app cookies.
    await expect(clean.getByText("No permission", { exact: true })).toHaveCount(0);
    await expect(clean.getByText("Access denied", { exact: true })).toHaveCount(0);
    await expect(clean.getByRole("heading", { level: 1 })).toContainText("Find an English tutor", { timeout: 20000 });
    await expect(clean.getByRole("heading", { name: "Tutors learners love", exact: true })).toBeVisible();
    await expect(clean.getByRole("heading", { name: "This page could not load", exact: true })).toHaveCount(0);
    await separate.addCookies([{ name: "sid", value: "old-cookie-from-another-preview", url: origin }]);
    await clean.setViewportSize({ width: 390, height: 844 });
    await clean.reload({ waitUntil: "domcontentloaded" });
    await expect(clean.getByRole("heading", { level: 1 })).toContainText("Find an English tutor");
    await clean.getByRole("link", { name: "Find Tutors", exact: true }).last().click();
    await expect(clean.getByRole("heading", { name: "Find Tutors", exact: true })).toBeVisible();
    assert.deepEqual(freshErrors, [], `Independent-browser errors: ${freshErrors.join("; ")}`);
    console.log("PASS independent browser profile: clean desktop and stale-cookie mobile do not show the reported error screen");
  } finally { await separate.close(); }
} finally {
  await context.close();
  await browser.close();
}
