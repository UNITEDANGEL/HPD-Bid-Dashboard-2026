// Nothing overlaps at the bottom of the map (owner, 23 Nov: "fix the overlapping button"): the round Working button
// sticks out above the bottom bar, so the Talk to Claude bar sits above it. And the morning ☀️ Today box waits as a small
// button in the corner ("make it hide in the corner, expand when I click it"): a tap opens it, ▼ Hide puts it back.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [width, height] of [[390, 844], [375, 667]]) {
    const c = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const page = await c.newPage();
    await page.goto(`${baseUrl}/map/?today=mini`, { waitUntil: "domcontentloaded" });
    const bar = page.locator(".fc-chatbar").first();
    const orb = page.locator(".fc-dock .fc-dock-ai").first();
    await bar.waitFor({ timeout: 20000 });
    await orb.waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
    const b = await bar.boundingBox();
    const o = await orb.boundingBox();
    assert.ok(b && o, "bar and Working button on screen");
    assert.ok(b.y + b.height <= o.y + 1, `${width}x${height}: Talk to Claude bar (bottom ${Math.round(b.y + b.height)}) ends above the Working button (top ${Math.round(o.y)})`);

    // ☀️ Today in the corner: small, not covering the bottom of the map.
    const mini = page.locator('[data-hpd-smoke="fc-today-mini"]');
    await mini.waitFor({ timeout: 10000 });
    assert.equal(await page.locator('[data-hpd-smoke="fc-today"]').count(), 0, "the full box waits for a tap");
    const m = await mini.boundingBox();
    assert.ok(m && m.width < 160 && m.height <= 60, `corner button is small (${m && Math.round(m.width)}x${m && Math.round(m.height)})`);
    assert.ok(m.y + m.height < b.y, "corner button is clear of the Talk to Claude bar");
    await mini.click();
    const full = page.locator('[data-hpd-smoke="fc-today"]');
    await full.waitFor({ timeout: 5000 });
    assert.equal(await mini.count(), 0);
    await page.locator('[data-hpd-smoke="fc-today-hide"]').click();
    await mini.waitFor({ timeout: 5000 });
    assert.equal(await full.count(), 0);
    await c.close();
  }
  console.log("PASS no overlap: Talk to Claude bar clears the Working button (390x844, 375x667); ☀️ Today waits in the corner, opens on a tap, ▼ Hide puts it back");
} finally {
  await browser.close();
}
