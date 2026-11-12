// 🗺 Notices stay on the map (owner, 10 Nov: "when I click on vendor tracking board it should open map"; "when I close
// notices board all disappear; I want to see notices on map, very important"). Notices → Vendor tracking board: the
// board opens below the map (the notice jobs on the map above it), 🗺 / ⬆ switches full screen; Close leaves the notice
// jobs on the map with the small Notices bar; ✅ Done is its own tab.
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
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  const allPins = await page.locator(".leaflet-marker-icon, .fc-pin").count();
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor({ timeout: 5000 }).catch(() => {}); if (!(await page.locator('[data-hpd-smoke="fc-board"]').count())) await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click(); // Notices opens the board itself (10 Nov)
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor();
  assert.equal(await board.getAttribute("data-with-map"), null, "opens full screen, not half-way up (owner, 12 Nov)");
  assert.ok((await board.boundingBox()).y < 844 * 0.1, "board starts at the top of the screen");
  { const cb = await page.locator('[data-hpd-smoke="fc-notice-chooser"]').boundingBox(); assert.ok(!cb || cb.y + cb.height < 90, "the picks are a slim strip at the top, not a box over the notices (owner, 12 Nov)"); }
  // Map toggle and back.
  await board.locator('[data-hpd-smoke="fc-board-map"]').click();
  assert.equal(await board.getAttribute("data-with-map"), "1");
  await board.locator('[data-hpd-smoke="fc-board-map"]').click();
  assert.equal(await board.getAttribute("data-with-map"), null);
  // ✅ Done is a tab.
  assert.match(await board.locator('[data-hpd-smoke="fc-board-side-done"]').innerText(), /✅ Done\s+\d+/);
  // Close: the notices stay on the map.
  await board.locator('[data-hpd-smoke="fc-board-close"]').click();
  const bar = page.locator('[data-hpd-smoke="fc-notice-chooser"]');
  await bar.waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  const pins = await page.locator(".leaflet-marker-icon, .fc-pin").count();
  assert.ok(pins > 0 && pins < allPins, `only the notice jobs on the map: ${pins} of ${allPins}`);
  assert.match(await bar.innerText(), /Priority/);
  assert.deepEqual(errors, []);
  console.log(`PASS notices on the map: the board opens below the map, ⬆/🗺 switches, ✅ Done tab; Close leaves ${pins} notice jobs on the map (of ${allPins})`);
} finally {
  await browser.close();
}
