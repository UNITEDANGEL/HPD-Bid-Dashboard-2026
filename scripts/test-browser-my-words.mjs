// 👂 It learns your words (plan item 18), typed in the chat on an iPhone: "when I say my week, I mean plan my week",
// then "my week" shows the week plan straight away.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const say = async (text, re) => {
    await page.locator('[data-hpd-smoke="fc-agent-close"]').click({ timeout: 1500 }).catch(() => {});
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 10000 });
    return page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  };
  assert.match(await say("when I say my week, I mean plan my week", /^👂 Got it/), /when you say "my week", I'll do "plan my week"/);
  await say("my week", /^🗓 Your week, planned/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-weekplan-day"]').count(), 7);
  await say("forget my week", /^👂 OK, I forgot "my week"/);
  assert.deepEqual(errors, []);
  console.log("PASS learns your words: taught in the chat, done straight away (my week = the week plan), forgotten on request");
} finally {
  await browser.close();
}
