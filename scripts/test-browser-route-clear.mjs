// Browser test: with a planned route at iPhone size, the "Clear route" button is at the top of
// Today's route panel (reachable without scrolling) and clears the route.
// Needs the app running. BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const route = ["EQ18710", "EQ15239", "EQ24465"];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.addInitScript(({ route, today }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: route, origin: { point: { lat: 40.6966, lng: -73.8273 }, label: "office" } }));
    sessionStorage.setItem("seeded", "1");
  }, { route, today });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-route-open"]').click();
  const clear = page.locator('[data-hpd-smoke="fc-route-clear"]');
  await clear.waitFor({ timeout: 60000 });
  await page.locator(".fc-route-body").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const box = await clear.boundingBox();
  const panel = await page.locator(".fc-route-body").boundingBox();
  assert.ok(box && panel && box.y >= panel.y - 1 && box.y + box.height <= panel.y + panel.height + 1, "Clear route stays visible even when the list is scrolled down");
  await clear.click();
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem("hpd-today-route-v1") || "{}").ids?.length, null, { timeout: 30000 });
  assert.equal(await clear.count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS route clear: button sticks to the top of the route panel and clears the route");
} finally {
  await browser.close();
}
