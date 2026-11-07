// 🔔 The notices panel is neat (owner, 7 Nov: "I don't like how it's scrolling left and right. Everything in one box"):
// at iPhone size every notice kind is in a 2-column grid inside the box, nothing scrolls sideways or sticks out, and
// each kind still filters the map.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const box = page.locator('[data-hpd-smoke="fc-notice-chooser"]');
  await box.waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  const m = await box.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const picks = b.querySelector(".fc-notice-picks");
    const tiles = [...b.querySelectorAll(".fc-notice-pick")].map((e) => e.getBoundingClientRect());
    return { left: r.left, right: r.right, vw: innerWidth, sideways: picks.scrollWidth - picks.clientWidth, out: tiles.filter((t) => t.left < r.left - 1 || t.right > r.right + 1).length, n: tiles.length, cols: new Set(tiles.slice(0, -1).map((t) => Math.round(t.left))).size };
  });
  assert.ok(m.left >= 0 && m.right <= m.vw, JSON.stringify(m));
  assert.ok(m.sideways <= 1, `no sideways scrolling (${m.sideways})`);
  assert.equal(m.out, 0, "every kind inside the box");
  assert.equal(m.cols, 2, "two columns");
  assert.ok(m.n >= 5);
  await page.screenshot({ path: `${process.env.TEMP || "/tmp"}/notice-panel.png` });
  // A kind still filters the map.
  await page.locator('[data-hpd-smoke="fc-notice-pick-priority"]').click();
  await page.waitForFunction(() => /Priority/i.test(document.querySelector('[data-hpd-smoke="fc-notice-chooser-title"]')?.textContent || ""), null, { timeout: 8000 });
  assert.deepEqual(errors, []);
  console.log(`PASS notices panel neat: ${m.n} kinds in 2 columns inside one box, no sideways scrolling; a kind still filters the map`);
} finally {
  await browser.close();
}
