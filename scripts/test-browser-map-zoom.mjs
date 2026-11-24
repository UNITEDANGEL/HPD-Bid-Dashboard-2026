// 🔍 Map zoom (owner, 24 Nov: "Fix + and - button overlap job card I don't need them I can pinch and zoom"):
// no + / − buttons on the map any more (they covered the job card); pinch to zoom still works (touch zoom on).
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
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => document.querySelectorAll('[data-hpd-smoke="fc-zoom-in"], [data-hpd-smoke="fc-zoom-out"], .fc-map-zoom, .leaflet-control-zoom').length);
  assert.equal(n, 0, "no + / − zoom buttons on the map");
  const touch = await page.evaluate(() => document.querySelector(".leaflet-container")?.classList.contains("leaflet-touch-zoom"));
  assert.ok(touch, "pinch to zoom is on");
  assert.deepEqual(errors, []);
  console.log("PASS map zoom: no + / − buttons, pinch to zoom on");
} finally {
  await browser.close();
}
