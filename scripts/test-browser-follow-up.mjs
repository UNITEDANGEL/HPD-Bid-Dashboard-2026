// 🔁 It follows up by itself (plan item 19), typed in the chat on an iPhone: "I'll call the tenant after lunch" ->
// "Got it. I'll bring it up …", a reminder saved for 1:30 PM, with Add to Calendar.
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
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("I'll call the tenant after lunch");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /^👍 Got it\. I'll bring it up /.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), / on .*at 1:30: call the tenant/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]"));
  assert.ok(saved.some((r) => r.what === "call the tenant" && r.time === "13:30"), "reminder saved for 1:30 PM");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-action"]', { hasText: "Add to Calendar" }).count(), 1);
  assert.deepEqual(errors, []);
  console.log("PASS follows up by itself: \"I'll call the tenant after lunch\" -> reminder at 1:30 PM, said back, Add to Calendar");
} finally {
  await browser.close();
}
