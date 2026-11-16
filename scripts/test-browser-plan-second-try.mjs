// 📅 Plan a second try after No Access (item 118, 15 Nov), in Plan my day at iPhone size: "Plan 5 jobs near me" (a
// phone location in Queens), View Job on the first one, I Have Arrived -> No Access -> Confirm (test mode skips the door photo check), then "Plan a second try" saves
// the day (3 days later, never a weekend) as a job note and shows it. Status server faked; nothing real is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// The same day the app picks: New York's today + 3, moved past a weekend.
const ny = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()).split("-").map(Number);
const t = new Date(Date.UTC(ny[0], ny[1] - 1, ny[2] + 3, 12));
while (t.getUTCDay() === 0 || t.getUTCDay() === 6) t.setUTCDate(t.getUTCDate() + 1);
const words = t.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", permissions: ["geolocation"], geolocation: { latitude: 40.7282, longitude: -73.7949 } });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1&fieldFlowTest=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator(".fc-reveal-controls").dispatchEvent("click");
  await page.getByRole("button", { name: "Plan my day" }).click();
  await page.getByRole("button", { name: "Plan 5 jobs near me" }).click();
  const first = page.locator(".plan-my-day__results article").first();
  await first.waitFor({ timeout: 20000 });
  const job = (await first.locator("strong").first().innerText()).trim();
  await first.getByRole("button", { name: "View Job" }).click();
  await page.getByRole("button", { name: "I Have Arrived" }).click();
  await page.getByRole("button", { name: "No Access", exact: true }).click();
  await page.getByRole("button", { name: "Evidence Saved · Confirm No Access" }).click();
  const plan = page.locator('[data-hpd-smoke="plan-second-try"]');
  await plan.waitFor({ timeout: 15000 });
  assert.match(await plan.innerText(), /Plan a second try/);
  await plan.click();
  const saved = page.locator('[data-hpd-smoke="plan-second-try-saved"]');
  await saved.waitFor({ timeout: 10000 });
  assert.equal((await saved.textContent()).trim(), `✓ Second try planned for ${words}.`);
  assert.equal(await plan.count(), 0, "the button is replaced by the saved day");
  const notes = await page.evaluate(() => Object.entries(localStorage).filter(([, v]) => v.includes("Second try planned")).map(([k, v]) => [k, v]));
  assert.ok(notes.some(([, v]) => v.includes(job) && v.includes(`Second try planned for ${words}.`)), `saved as a note on the job: ${JSON.stringify(notes).slice(0, 300)}`);
  assert.ok(notes.some(([, v]) => v.includes("No access")), "the No access proof note was saved too");
  assert.deepEqual(errors, []);
  console.log(`PASS plan second try: Plan my day -> 5 near me -> Arrived -> No Access -> Confirm -> "${words}" saved on ${job}`);
} finally {
  await browser.close();
}
