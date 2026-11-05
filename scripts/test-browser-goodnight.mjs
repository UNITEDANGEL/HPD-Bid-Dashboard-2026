// 🌙 Goodnight from the helper (owner's idea, 4 Nov): the first open after 9 PM New York says goodnight once (tomorrow's
// first thing when there is one), in its bubble; a second open the same night doesn't say it again. Clock set to 10 PM.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => { localStorage.setItem("hpd-test-hello", "1"); if (window.speechSynthesis) window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 20); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 10 PM New York (02:00 UTC next day in standard time).
  await page.clock.install({ time: new Date("2026-11-05T03:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.waitForFunction(() => /^🌙 Goodnight, \w+\. .*Get some rest!$/.test(document.querySelector('[data-hpd-smoke="fc-orb-say"]')?.textContent || ""), null, { timeout: 15000 });
  const said = await page.locator('[data-hpd-smoke="fc-orb-say"]').innerText();
  // Opened again the same night: no second goodnight.
  await page.evaluate(() => localStorage.setItem("hpd-robot-hello", "0"));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  assert.ok(!/Goodnight/.test(await page.locator('[data-hpd-smoke="fc-orb-say"]').innerText().catch(() => "")), "once a night");
  assert.deepEqual(errors, []);
  console.log(`PASS goodnight: at 10 PM "${said}"; not again the same night`);
} finally {
  await browser.close();
}
