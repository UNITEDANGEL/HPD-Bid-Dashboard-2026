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
  const btn = page.locator('[data-hpd-smoke="fc-map-style"]');
  assert.equal(await btn.getAttribute("data-style"), "light");
  const dot = await page.evaluate(() => { const d = [...document.querySelectorAll(".fc-job-dot")].map((x) => x.getBoundingClientRect().width); const p = [...document.querySelectorAll(".fc-label-marker .fc-pin")].map((x) => x.getBoundingClientRect().width / 36 * 20); return Math.max(0, ...d, ...p); });
  assert.ok(dot >= 19.5, `bigger dots (${dot})`);
  await btn.click();
  await page.waitForFunction(() => document.querySelector(".leaflet-container")?.classList.contains("is-satellite"), null, { timeout: 10000 });
  assert.equal(await btn.getAttribute("data-style"), "satellite");
  assert.match(await btn.innerText(), /Photo/);
  await page.waitForTimeout(1500);
  assert.ok(sat.some((u) => /World_Imagery/.test(u)) && sat.some((u) => /World_Transportation/.test(u)), "the photo and the street names load");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector(".leaflet-container")?.classList.contains("is-satellite"), null, { timeout: 60000 });
  await page.locator('[data-hpd-smoke="fc-map-style"]').click();
  await page.waitForFunction(() => !document.querySelector(".leaflet-container")?.classList.contains("is-satellite"), null, { timeout: 10000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-map-style"]').getAttribute("data-style"), "dark");
  await page.locator('[data-hpd-smoke="fc-map-style"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-map-style"]').getAttribute("data-style"), "light");
  assert.deepEqual(errors, []);
  console.log("PASS better map: Street -> Photo (satellite + street names) -> Dark -> Street, kept after reopening; bigger pins");
} finally {
  await browser.close();
}
