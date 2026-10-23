// ☀️ Start my day (23 Oct) at iPhone size with the real jobs, the clock set to 8 AM New York: the card shows once, one
// tap reads the day and plans the route (both answers in the helper), and it doesn't come back after a reload.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await c.addInitScript(() => {
    localStorage.setItem("hpd-test-morning", "1");
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 8:00 AM New York (12:00 UTC in daylight time), on a weekday.
  await page.clock.install({ time: new Date("2026-10-26T12:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const card = page.locator('[data-hpd-smoke="fc-morning"]');
  await card.waitFor({ timeout: 60000 });
  if (shots) await page.screenshot({ path: `${shots}/morning-card.png` });
  await card.locator('[data-hpd-smoke="fc-morning-go"]').click();
  await page.waitForFunction(() => { const t = document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""; return /Today:/.test(t) && /Your day:|stops?/.test(t); }, null, { timeout: 30000 });
  const reply = await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  assert.equal(await card.count(), 0, "the card goes away");
  if (shots) await page.screenshot({ path: `${shots}/morning-started.png` });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(4000);
  assert.equal(await card.count(), 0, "once a day");
  assert.deepEqual(errors, []);
  console.log(`PASS start my day: 8 AM card -> one tap -> "${reply.replace(/\s+/g, " ").slice(0, 140)}…"; not shown again after a reload`);
  await c.close();
} finally {
  await browser.close();
}
