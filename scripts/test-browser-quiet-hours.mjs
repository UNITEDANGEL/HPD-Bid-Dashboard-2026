// 🔕 Quiet hours (plan item 26): at 10 PM New York an alert (an email from HPD) shows without a sound, a voice or a
// buzz; while working the notices (Notices open) it rings as before.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const ny = (ms) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
let t = Math.floor(Date.now() / 3600000) * 3600000 + 5 * 60000;
while (ny(t) !== 22) t += 3600000;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => {
    window.__vib = []; window.__said = [];
    navigator.vibrate = (p) => { window.__vib.push(JSON.stringify(p)); return true; };
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(t) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.mouse.click(200, 400); // a touch, so the phone allows sound
  if (await page.locator(".fc-job-sheet-close").count()) await page.locator(".fc-job-sheet-close").first().click();
  const alert = () => page.evaluate(() => window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "message", title: "📩 Test Tracker wrote · EQ15239", omo: "EQ15239", who: "Test Tracker", text: "Kindly provide a status update" } })));
  const heard = () => page.evaluate(() => ({ vib: window.__vib.length, said: window.__said.filter((x) => /Email from/.test(x)).length }));
  await page.evaluate(() => { window.__vib = []; window.__said = []; });
  await alert();
  await page.clock.runFor(3000);
  assert.deepEqual(await heard(), { vib: 0, said: 0 }, "10 PM: no buzz, no voice");
  // It still shows on the screen (silently); OK puts it away.
  await page.locator('[data-hpd-smoke="fc-hpd-ping"]').first().waitFor({ timeout: 5000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  // Working the notices: it rings.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.clock.runFor(500);
  await alert();
  await page.clock.runFor(3000);
  const h = await heard();
  assert.ok(h.vib >= 1, `on the notices it rings (${JSON.stringify(h)})`);
  assert.deepEqual(errors, []);
  console.log("PASS quiet hours: at 10 PM an alert is silent (no sound, voice or buzz); on the notices it rings");
} finally {
  await browser.close();
}
