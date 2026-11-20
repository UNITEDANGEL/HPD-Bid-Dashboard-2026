// "Working at" can be ended with ✕ I left (owner, 20 Nov: "I already left and that thing is frozen"), and stays gone
// after a reload; the job card shows when the job was awarded. Real clock, nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settle = async () => {
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  };
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await settle();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  // The job card shows the award date (the first job that has one).
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let HERE = "";
  for (const id of ids.slice(0, 25)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    const has = await page.locator('[data-hpd-smoke="jc-awarded"]').count();
    if (has) { HERE = id; assert.match(await page.locator('[data-hpd-smoke="jc-awarded"]').innerText(), /awarded[\s\S]*\d{4}[\s\S]*(ago|today|yesterday)/i); }
    await page.locator(".fc-job-sheet-close").click();
    if (has) break;
  }
  assert.ok(HERE, "a job card shows its award date");
  await page.evaluate(({ HERE }) => {
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [HERE]: { FieldArrivedAt: new Date(Date.now() - 20 * 60000).toISOString() } }));
  }, { HERE });
  await page.reload({ waitUntil: "load" });
  await settle();
  const bar = page.locator('[data-hpd-smoke="fc-onsite"]');
  await bar.waitFor({ timeout: 20000 });
  // The "New update" card can sit over the bottom of the map on a new version: close it first.
  await page.locator('[data-hpd-smoke="fc-newupdate-ok"]').click({ timeout: 4000 }).catch(() => {});
  await page.locator('[data-hpd-smoke="fc-onsite-left"]').click();
  await bar.waitFor({ state: "detached", timeout: 10000 });
  await page.reload({ waitUntil: "load" });
  await settle();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-hpd-smoke="fc-onsite"]').count(), 0, "still gone after a reload");
  assert.deepEqual(errors, []);
  console.log(`PASS on site: ${HERE} awarded line on the card; ✕ I left ends "Working at" and it stays gone`);
} finally {
  await browser.close();
}
