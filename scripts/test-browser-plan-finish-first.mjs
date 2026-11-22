// 🗺 Closest finish dates first in Plan my day (plan item 24, 22 Nov), at iPhone size: "Plan 5 jobs near me" (a phone
// location in Queens) puts late / due-soon awarded jobs (HPD finish date) ahead of plain "good travel fit" stops, and
// each such stop says why ("3 days late (HPD finish date)", "Due in 2 days (HPD finish date)"). Status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", permissions: ["geolocation"], geolocation: { latitude: 40.7282, longitude: -73.7949 } });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1&fieldFlowTest=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator(".fc-reveal-controls").dispatchEvent("click");
  await page.getByRole("button", { name: "Plan my day" }).click();
  await page.getByRole("button", { name: "Plan 5 jobs near me" }).click();
  const stops = page.locator(".plan-my-day__results article");
  await stops.first().waitFor({ timeout: 20000 });
  const reasons = (await stops.locator("em").allInnerTexts()).map((t) => t.replace(/^Why AI selected it:\s*/, "").trim());
  const finish = reasons.map((r, i) => [r, i]).filter(([r]) => /\(HPD finish date\)$/.test(r));
  assert.ok(finish.length > 0, `at least one stop is picked for its HPD finish date: ${JSON.stringify(reasons)}`);
  for (const [r] of finish) assert.match(r, /^(\d+ days? late|Due today|Due in \d+ days?) \(HPD finish date\)$/);
  const plain = reasons.findIndex((r) => r === "Good travel fit" || r === "Active job");
  if (plain >= 0) assert.ok(finish[0][1] < plain, `finish-date stops come before plain travel stops: ${JSON.stringify(reasons)}`);
  assert.deepEqual(errors, []);
  console.log(`PASS plan finish first: ${JSON.stringify(reasons)}`);
} finally {
  await browser.close();
}
