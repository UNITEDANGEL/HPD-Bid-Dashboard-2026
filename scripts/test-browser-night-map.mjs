// 🌙 Dark map at night (idea list): All → Map style cycles Light → Dark → Dark at night → Light, kept on the phone.
// At 5:30 PM in November (after sunset) "Dark at night" makes the map dark; at 2 PM it's light. Kept after a reload.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const run = async (time, fn) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(time) });
  const open = async () => {
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  };
  await open();
  await fn(page, open);
  assert.deepEqual(errors, []);
  await c.close();
};
const dark = (page) => page.locator(".fc-map-node").evaluate((n) => n.classList.contains("is-dark"));
const row = (page) => page.locator('[data-hpd-smoke="fc-more-map"]');
try {
  // 5:30 PM, November.
  await run("2026-11-09T22:30:00Z", async (page, open) => {
    assert.equal(await dark(page), false, "light at first");
    await page.locator('[data-hpd-smoke="fc-more-open"]').click();
    assert.match(await row(page).innerText(), /Light map · tap to change/);
    await row(page).click();
    assert.match(await row(page).innerText(), /Dark map/);
    assert.equal(await dark(page), true);
    await row(page).click();
    assert.match(await row(page).innerText(), /Dark at night \(dark now\)/);
    assert.equal(await dark(page), true);
    await open();
    assert.equal(await dark(page), true, "kept after a reload");
    await page.locator('[data-hpd-smoke="fc-more-open"]').click();
    await row(page).click();
    assert.match(await row(page).innerText(), /Light map/);
    assert.equal(await dark(page), false);
    await row(page).click(); await row(page).click(); // back to Dark at night for the next check
  });
  // 2 PM: Dark at night is light.
  await run("2026-11-09T19:00:00Z", async (page) => {
    await page.evaluate(() => localStorage.setItem("hpd-map-style", "night"));
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    assert.equal(await dark(page), false, "2 PM: light");
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('[data-hpd-smoke="fc-more-open"]').click();
    assert.match(await row(page).innerText(), /Dark at night \(light now\)/);
  });
  console.log("PASS night map: Light → Dark → Dark at night → Light, kept on the phone; dark at 5:30 PM in November, light at 2 PM");
} finally {
  await browser.close();
}
