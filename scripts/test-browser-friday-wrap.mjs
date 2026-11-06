// 📊 Friday wrap (plan item 23), on an iPhone with the clock at Friday 5:20 PM: the chat shows the week in a few words,
// once; Open gives the weekly report.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const ny = (ms, o) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...o }).format(new Date(ms));
// The next Friday 5:20 PM in New York (whole minutes from the top of this hour, so 17:20 is hit).
let t = Math.floor(Date.now() / 3600000) * 3600000;
for (let i = 0; i < 24 * 8 * 3; i++, t += 20 * 60000) if (ny(t, { weekday: "short" }) === "Fri" && ny(t, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) === "17:20") break;
if (ny(t, { weekday: "short" }) !== "Fri") throw new Error("no Friday 5:20 PM found");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(t) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"][data-kind="week"]');
  for (let i = 0; i < 8 && !(await nudge.count()); i++) {
    await page.clock.runFor(61000);
    // Other notes (a bid due soon, a new notice) come first: close them, as the owner would.
    if (!(await nudge.count()) && await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').count()) await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click();
  }
  await nudge.waitFor({ timeout: 5000 });
  assert.match(await nudge.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /^📊 Your week: .*(?:job|jobs) closed in the field.*(?:bids? won|no bids won).*\. (First next week: |Nothing booked for next week yet\.)/);
  await nudge.locator('[data-hpd-smoke="fc-chat-nudge-go"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-reply"]').waitFor();
  await page.clock.runFor(61000);
  assert.equal(await nudge.count(), 0, "once");
  assert.deepEqual(errors, []);
  console.log("PASS Friday wrap: Friday 5:20 PM the chat shows the week in a few words, Open = the weekly report, once");
} finally {
  await browser.close();
}
