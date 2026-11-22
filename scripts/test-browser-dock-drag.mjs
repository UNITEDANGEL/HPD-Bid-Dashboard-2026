// Dragging the map slides the bottom buttons away (28 Oct): while a finger moves the map the dock and the strip
// go down out of view (and can't be tapped by accident); when you let go they come back and work.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const dock = page.locator('[data-hpd-smoke="fc-dock"]');
  await dock.waitFor({ timeout: 20000 });
  const shown = () => dock.evaluate((el) => { const r = el.getBoundingClientRect(); return Number(getComputedStyle(el).opacity) > 0.9 && r.top < innerHeight; });
  assert.equal(await shown(), true, "dock showing before");

  // Drag an empty bit of the map and hold (the chips over the map move with the day: weather, street cleaning).
  const [x, y] = await page.evaluate(() => {
    for (const [px, py] of [[200, 520], [90, 260], [300, 300], [80, 480], [200, 250], [120, 600]]) {
      const el = document.elementFromPoint(px, py);
      if (el && el.closest(".leaflet-container") && !el.closest(".leaflet-marker-icon, .leaflet-marker-pane, button, a")) return [px, py];
    }
    return [200, 520];
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 12, y - i * 10);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.querySelector(".fc-app")?.classList.contains("fc-map-dragging")), true, "dragging");
  assert.equal(await shown(), false, "dock slid away while dragging");
  assert.equal(await page.locator('[data-hpd-smoke="fc-dock"]').evaluate((el) => getComputedStyle(el).pointerEvents), "none", "dock can't be tapped mid-drag");
  await page.mouse.up();

  // Back after letting go, and it works.
  await page.waitForFunction(() => !document.querySelector(".fc-app")?.classList.contains("fc-map-dragging"), null, { timeout: 3000 });
  await page.waitForTimeout(400);
  assert.equal(await shown(), true, "dock back after the drag");
  await page.locator('[data-hpd-smoke="fc-dock"] [data-hpd-smoke="fc-bids-open"]').click();
  await page.locator('[data-hpd-smoke="fc-bids-list"]').waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  await c.close();
  console.log("PASS dock drag: the bottom buttons slide away while the map is dragged (not tappable), come back on release and work");
} finally {
  await browser.close();
}
