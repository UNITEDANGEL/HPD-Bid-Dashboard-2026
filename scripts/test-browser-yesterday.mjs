// 🧠 It remembers yesterday (plan item 25): yesterday you said "I'll call the tenant after lunch"; this morning's brief
// asks "Yesterday you said you'd call the tenant. Did that get done?", once.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const nyDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
const yesterday = nyDay(Date.now() - 86400000);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript((y) => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-promises-v1", JSON.stringify([{ day: y, what: "call the tenant" }])); sessionStorage.setItem("seeded", "1"); } } catch { /* private mode */ }
  }, yesterday);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await page.waitForFunction(() => /Yesterday you said you'd call the tenant\. Did that get done\?/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-promises-v1") || "[]")), [], "asked once");
  assert.deepEqual(errors, []);
  console.log("PASS remembers yesterday: the morning brief asks about what you said you'd do yesterday, once");
} finally {
  await browser.close();
}
