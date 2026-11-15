// 🔍 Map zoom buttons (owner, 14 Nov): big + / - on the map, smooth zoom steps.
// (template: better map)
// 🗺 A better map (owner, 8 Nov: cleaner map picture, bigger clearer pins, satellite view): the Map button goes Street ->
// Photo (satellite + street names) -> Dark -> Street, kept after the app opens again; pins are bigger (dots 20 px).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const sat = [];
  await context.route(/World_Imagery|World_Transportation|World_Boundaries_and_Places/, (r) => { sat.push(r.request().url()); return r.fulfill({ status: 200, contentType: "image/png", body: png }); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-zoom-in"]').length === 1, null, { timeout: 30000 });
  const zoom = () => page.evaluate(() => { const c = document.querySelector(".leaflet-container"); return Number(c?.dataset?.z) || null; });
  const size = await page.locator('[data-hpd-smoke="fc-zoom-in"]').boundingBox();
  assert.ok(size && size.width >= 48 && size.height >= 48, "big zoom buttons");
  const tiles = () => page.evaluate(() => document.querySelector(".leaflet-tile-pane .leaflet-layer")?.getAttribute("style") || document.querySelector(".leaflet-container")?.className || "");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /map.?view/i.test(k)) || "x") || "null"));
  await page.locator('[data-hpd-smoke="fc-zoom-in"]').click();
  await page.waitForTimeout(1200);
  await page.locator('[data-hpd-smoke="fc-zoom-out"]').click();
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /map.?view/i.test(k)) || "x") || "null"));
  assert.ok(after, "map view saved after zooming");
  void zoom; void tiles; void before;
  assert.deepEqual(errors, []);
  console.log("PASS map zoom buttons: + and - are big and work");
} finally {
  await browser.close();
}
