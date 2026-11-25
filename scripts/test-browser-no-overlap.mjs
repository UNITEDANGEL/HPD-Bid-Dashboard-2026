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
    // 25 Nov (owner: "fix overlap today and weather"): the weather / hint lines never sit under ☀️ Today, with or without the chat bar.
    const hitsToday = () => page.evaluate(() => { const t = document.querySelector('[data-hpd-smoke="fc-today-mini"]').getBoundingClientRect(); return [...document.querySelectorAll(".fc-map-hints > *")].map((e) => e.getBoundingClientRect()).filter((r) => r.height && r.bottom > t.top && r.top < t.bottom && r.right > t.left && r.left < t.right).length; });
    assert.equal(await hitsToday(), 0, "weather line clear of ☀️ Today");
    // The owner's phone has one Claude button and no chat bar: the hint lines then sit at the top, under ☀️ Today.
    await page.evaluate(() => localStorage.setItem("hpd-test-one-claude", "1"));
    await page.reload({ waitUntil: "load" });
    await mini.waitFor({ timeout: 20000 });
    await page.locator(".fc-map-hints > *").first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    assert.equal(await page.locator(".fc-chatbar").count(), 0, "one Claude: no chat bar");
    assert.equal(await hitsToday(), 0, "weather line clear of ☀️ Today without the chat bar");
    await page.evaluate(() => localStorage.removeItem("hpd-test-one-claude"));
    await page.reload({ waitUntil: "load" });
    await mini.waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    // A reload can show the ✨ New update popup: Got it, like the owner would.
    const gotIt = page.locator('[data-hpd-smoke="fc-newupdate-ok"]');
    if (await gotIt.count()) await gotIt.click();
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
