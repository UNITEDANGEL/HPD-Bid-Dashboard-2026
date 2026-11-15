// 💰 What each job really made (idea, 14 Nov): a finished job with costs shows "Made $X: award − costs"; an open job does not.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "ER02330";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker.[^/]+.workers.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  // The cost (and, later, the finished outcome) are saved on the phone first, the way the app does it.
  const seed = (outcome) => c.addInitScript(([job, done]) => {
    if (localStorage.getItem("hpd-job-workflow-overrides-v2")) return;
    const now = new Date().toISOString();
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: { JobCosts: [{ at: "2026-11-10T15:00:00.000Z", amount: 200, what: "paint" }], ...(done ? { FieldOutcome: "WORK_COMPLETED" } : {}), updatedAt: now, UpdatedAt: now } }));
  }, [JOB, outcome]);
  await seed(false);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const openJob = async () => {
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(JOB).catch(() => {});
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  };
  await openJob();
  await page.locator('[data-hpd-smoke="jc-costs"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-costs"] summary').innerText(), /Costs: \$200 spent/, "the cost shows");
  assert.equal(await page.locator('[data-hpd-smoke="jc-made"]').count(), 0, "an open job shows no 'made' line");
  await page.evaluate(() => { const k = "hpd-job-workflow-overrides-v2"; const o = JSON.parse(localStorage.getItem(k)); o.ER02330.FieldOutcome = "WORK_COMPLETED"; localStorage.setItem(k, JSON.stringify(o)); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const made = page.locator('[data-hpd-smoke="jc-made"]');
  await made.waitFor({ timeout: 10000 });
  const text = await made.innerText();
  assert.match(text, /^💰 (Made|Lost) \$[\d,]+ on this job: \$[\d,]+ award − \$200 costs/);
  const award = Number(/\$([\d,]+) award/.exec(text)[1].replace(/,/g, ""));
  const shown = Number(/(?:Made|Lost) \$([\d,]+)/.exec(text)[1].replace(/,/g, ""));
  assert.equal(shown, Math.abs(award - 200), "made = award − costs");
  assert.deepEqual(errors, []);
  console.log("job-made browser test passed");
} finally {
  await browser.close();
}
