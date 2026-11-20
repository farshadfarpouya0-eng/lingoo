// Run against the managed local preview: npx tsx scripts/mobile-hero-regression.ts
import "dotenv/config";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";

const origin = "http://127.0.0.1:3000";

async function main() {
  assert.ok(localDatabaseConfigured(), "Use the local sandbox database only.");
  const browser = await chromium.launch({ headless: true });
  const errors: string[] = [];
  try {
    for (const lang of ["en", "zh", "ja"]) {
      for (const width of [320, 360, 390, 430]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
        await context.addCookies([{ name: "lang", value: lang, url: origin }]);
        const page = await context.newPage();
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(origin, { waitUntil: "domcontentloaded" });
        const carousel = page.getByTestId("mobile-hero-carousel");
        await expect(carousel).toBeVisible();
        const first = page.getByTestId("mobile-hero-daily");
        await expect(first).toBeVisible();
        await page.waitForFunction(() => {
          const image = document.querySelector<HTMLImageElement>('[data-testid="mobile-hero-daily"] img');
          return !!image?.complete && image.naturalWidth > 0;
        });
        await page.waitForTimeout(250);
        const size = await first.boundingBox();
        const copy = await page.locator(".hero-copy-main").boundingBox();
        const actions = await page.locator(".hero-actions").boundingBox();
        assert.ok(size && copy && actions && size.width >= width * 0.78 && size.height >= 180, `${lang}/${width}: photo must be large`);
        assert.ok(size.y >= copy.y + copy.height - 1 && actions.y >= size.y + size.height, `${lang}/${width}: image must sit between headline and actions`);
        const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(dimensions.scroll <= dimensions.client + 1, `${lang}/${width}: entire page must not overflow horizontally (${dimensions.scroll}/${dimensions.client})`);
        assert.equal(await carousel.locator(".hero-mobile-slide").count(), 5);
        assert.equal(await carousel.locator('.hero-mobile-dot[aria-current="true"]').count(), 1);
        await expect(page.locator(".hero-scene")).toBeHidden();
        await expect(page.locator(".hero-benefits li")).toHaveCount(3);
        await expect(page.locator(".hero-benefits li").nth(2)).toBeVisible();
        await context.close();
      }
      console.log(`PASS ${lang}: 320, 360, 390 and 430px; large course photo, correct order and no page overflow`);
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    await context.addCookies([{ name: "lang", value: "en", url: origin }]);
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const carousel = page.getByTestId("mobile-hero-carousel");
    const dots = carousel.locator(".hero-mobile-dot");
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
    await carousel.getByRole("button", { name: "Next cards" }).click();
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
    await dots.nth(3).click();
    await expect(dots.nth(3)).toHaveAttribute("aria-current", "true");
    await carousel.getByRole("button", { name: "Previous cards" }).click();
    await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
    await dots.nth(4).click();
    await expect(dots.nth(4)).toHaveAttribute("aria-current", "true");
    await carousel.getByRole("button", { name: "Next cards" }).click();
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
    await dots.nth(0).click();
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");

    // Actual touch pointer swipe, not a synthetic scrollLeft change.
    const track = await page.getByTestId("mobile-hero-track").boundingBox();
    assert.ok(track);
    const cdp = await context.newCDPSession(page);
    const y = Math.round(track.y + Math.min(100, track.height / 2));
    const from = Math.round(track.x + track.width * 0.82);
    const to = Math.round(track.x + track.width * 0.20);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(from + (to - from) * i / 8), y }] });
      await page.waitForTimeout(25);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
    await expect(page).toHaveURL(origin + "/");
    await page.getByTestId("mobile-hero-kids").click();
    await expect(page).toHaveURL(/\/assessment\?audience=kids&goal=Kids/);
    console.log("PASS controls, dots, real touch swipe and Kids course link");
    await context.close();

    // Auto-advance runs only for motion-enabled visitors and yields to manual interaction.
    const automatic = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "no-preference" });
    const automaticPage = await automatic.newPage();
    await automaticPage.goto(origin, { waitUntil: "domcontentloaded" });
    const autoDots = automaticPage.getByTestId("mobile-hero-carousel").locator(".hero-mobile-dot");
    await expect(autoDots.nth(1)).toHaveAttribute("aria-current", "true", { timeout: 10_000 });
    await autoDots.nth(0).click();
    await expect(autoDots.nth(0)).toHaveAttribute("aria-current", "true");
    await automaticPage.waitForTimeout(7000);
    await expect(autoDots.nth(0)).toHaveAttribute("aria-current", "true");
    await automatic.close();
    console.log("PASS automatic advance pauses after visitor interaction");

    // The previous desktop 3D scene must remain the desktop experience.
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(desktopPage.locator(".hero-scene")).toBeVisible();
    await expect(desktopPage.getByTestId("mobile-hero-carousel")).toBeHidden();
    const firstTransform = await desktopPage.locator(".hero-orbit").evaluate(el => (el as HTMLElement).style.transform);
    await desktopPage.waitForTimeout(350);
    const nextTransform = await desktopPage.locator(".hero-orbit").evaluate(el => (el as HTMLElement).style.transform);
    assert.notEqual(firstTransform, nextTransform, "Desktop orbit must continue to move");
    assert.deepEqual(errors, [], "No client-side errors in the hero");
    console.log("PASS desktop 3D orbit remains visible and animated");
    await desktop.close();
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
