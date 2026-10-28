// 🌆 Wrap up the day (23 Oct) at iPhone size with the real jobs, the clock set to 6 PM New York: the card shows once, one
// tap says how today went and the bids coming up (both in the helper), and it doesn't come back after a reload.
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
    localStorage.setItem("hpd-test-evening", "1");
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 6:00 PM New York (22:00 UTC in daylight time), on a weekday.
  await page.clock.install({ time: new Date("2026-10-26T22:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const card = page.locator('[data-hpd-smoke="fc-evening"]');
  await card.waitFor({ timeout: 60000 });
  if (shots) await page.screenshot({ path: `${shots}/evening-card.png` });
  await card.locator('[data-hpd-smoke="fc-evening-go"]').click();
  await page.waitForFunction(() => { const t = document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""; return /Today you won/.test(t) && /invitations? to bid|No open invitations/.test(t); }, null, { timeout: 30000 });
  const reply = await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  // Tomorrow's weather (the test browser's fixed forecast) and parking come with it.
  assert.match(reply, /Tomorrow: \d+° to \d+°F/);
  assert.match(reply, /Tomorrow: alternate side parking|Tomorrow is Sunday|only have the 2026/);
  assert.equal(await card.count(), 0, "the card goes away");
  if (shots) await page.screenshot({ path: `${shots}/evening-started.png` });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(4000);
  assert.equal(await card.count(), 0, "once a day");
  assert.deepEqual(errors, []);
  console.log(`PASS wrap up the day: 6 PM card -> one tap -> "${reply.replace(/\s+/g, " ").slice(0, 140)}…"; not shown again after a reload`);
  await c.close();
} finally {
  await browser.close();
}
