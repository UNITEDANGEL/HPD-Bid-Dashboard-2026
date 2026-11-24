// 💬 Tenant replies in one place (idea, 24 Nov: "Every tenant text answer shows in one list with the job"): All ->
// Tenant replies lists the answers kept on this phone newest first, each with its job; a tap opens that job card.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  await page.addInitScript((omo) => {
    try {
      localStorage.setItem("hpd-tenant-replies", JSON.stringify([
        { omo, body: "Thursday morning is fine", at: "2026-11-20T14:00:00Z" },
        { omo: "", body: "Who is this?", at: "2026-11-21T15:30:00Z" },
        { omo, body: "Yes I will be home after 2", at: "2026-11-23T18:45:00Z" },
      ]));
    } catch { /* private mode */ }
  }, JOB);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  const row = page.locator('[data-hpd-smoke="fc-more-tenant-replies"]');
  await row.waitFor({ timeout: 10000 });
  assert.match(await row.innerText(), /3 answers from tenants/);
  await row.click();
  const sheet = page.locator('[data-hpd-smoke="fc-tenant-replies"]');
  await sheet.waitFor({ timeout: 10000 });
  const items = page.locator('[data-hpd-smoke="fc-tenant-reply"]');
  assert.equal(await items.count(), 3);
  assert.match(await items.first().innerText(), /Yes I will be home after 2/, "newest first");
  assert.match(await items.first().innerText(), new RegExp(JOB));
  assert.equal(await items.nth(1).isDisabled(), true, "an unknown number can't open a job");
  await items.first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  assert.equal(await sheet.count(), 0, "the list closes when the job opens");
  assert.deepEqual(errors, []);
  console.log("PASS tenant replies: 3 answers newest first with the job; tap opens the job card");
} finally {
  await browser.close();
}
