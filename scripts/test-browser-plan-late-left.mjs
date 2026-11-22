// ⏳ Late jobs that didn't fit (plan item 26, 22 Nov), at iPhone size: asking Plan my day for 1 stop near a phone in
// Queens leaves the other late jobs (past HPD's finish date) out; the "⏳ N late jobs didn't fit" box lists them, most
// late first, and Add puts one on the plan (selected) and takes it out of the box. Status server faked.
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
  // 5 stops first: how many late jobs are there in all (on the plan + left out)?
  await page.getByRole("button", { name: "Plan 5 jobs near me" }).click();
  const stops = page.locator(".plan-my-day__results article");
  await stops.first().waitFor({ timeout: 20000 });
  const lateOf = async () => (await stops.locator("em").allInnerTexts()).filter((t) => /days? late \(HPD finish date\)/.test(t)).length;
  const box = page.locator('[data-hpd-smoke="plan-late-left"]');
  const leftCount = async () => (await box.count()) ? Number((await box.locator("strong").first().innerText()).match(/(\d+) late/)[1]) : 0;
  const totalLate = (await lateOf()) + (await leftCount());
  assert.ok(totalLate >= 2, `test data needs 2+ late jobs (HPD finish date passed): ${totalLate}`);
  // Now just 1 stop: the rest of the late jobs must show in the box.
  await page.locator(".plan-my-day__composer textarea").fill("Plan 1 job near me");
  await page.locator(".plan-my-day__composer").getByRole("button", { name: "Send" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".plan-my-day__results article").length === 1, null, { timeout: 20000 });
  await box.waitFor({ timeout: 10000 });
  const left = await leftCount();
  assert.equal(left, totalLate - (await lateOf()), `box counts every late job not on the plan (total ${totalLate})`);
  const rows = box.locator("li");
  const reasons = await rows.locator("small").allInnerTexts();
  const days = reasons.map((t) => Number(t.match(/^(\d+) days? late/)?.[1]));
  assert.ok(days.every((d) => d > 0), `each row says how late: ${JSON.stringify(reasons)}`);
  assert.deepEqual(days, [...days].sort((a, b) => b - a), "most late first");
  const addBtn = rows.first().getByRole("button", { name: /^Add / });
  const h = await addBtn.boundingBox();
  assert.ok(h && h.height >= 44, `Add button is thumb-size: ${h?.height}`);
  const firstId = (await rows.first().locator("b").innerText()).trim();
  await addBtn.click();
  await page.waitForFunction(() => document.querySelectorAll(".plan-my-day__results article").length === 2, null, { timeout: 5000 });
  const added = stops.nth(1);
  assert.equal((await added.locator("strong").innerText()).trim(), firstId, "Add puts that job on the plan");
  assert.ok(await added.locator('input[type="checkbox"]').isChecked(), "added job is selected");
  assert.equal(await leftCount(), left - 1, "and it leaves the box");
  assert.match(await page.locator(".plan-my-day__accept").innerText(), /2 Selected/);
  assert.deepEqual(errors, []);
  console.log(`PASS plan late left out: ${left} late left out of ${totalLate}; added ${firstId}`);
} finally {
  await browser.close();
}
