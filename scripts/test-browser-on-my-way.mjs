// 🚗 "I'm on my way" (plan item 27), on an iPhone about 2 miles from ER01720: "on my way to ER01720" (like "tell the tenant I'm
// on my way") -> the text has a clock time ("I should be there around …") and the minutes; nothing is sent by itself.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", geolocation: { latitude: 40.7425, longitude: -73.8164, accuracy: 10 }, permissions: ["geolocation"] });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const sent = [];
  await c.route("**/api/drive/tenant-sms", (r) => { sent.push(1); return r.fulfill({ json: { sent: true } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.waitForTimeout(1500);
  const say = async (text, re) => {
    await page.locator('[data-hpd-smoke="fc-agent-close"]').click({ timeout: 1500 }).catch(() => {});
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').press("Enter");
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 15000 }).catch(async (e) => { console.log("REPLY:", await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText().catch(() => "none")); throw e; });
    return page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  };
  const r = await say("on my way to ER01720", /I'm on my way|no tenant phone/);
  if (/no tenant phone/.test(r)) { console.log("SKIP on my way: ER01720 has no tenant phone in this data"); process.exit(0); }
  assert.match(r, /I'm on my way\. I should be there around \d{1,2}:\d{2} [AP]M \(about \d+ minutes\)\./);
  assert.equal(sent.length, 0, "nothing sent by itself");
  assert.deepEqual(errors, []);
  console.log("PASS on my way: the text says when you'll be there (a clock time and the minutes); nothing sent by itself");
} finally {
  await browser.close();
}
