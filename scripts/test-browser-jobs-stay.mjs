// 📅 Jobs and days (owner, 8 Nov: "every time I click Jobs and close, the jobs disappear"; "I want to see all jobs for
// the year; when I click Jobs I should be able to pick any days back, but by default I would like to see 60 days"):
// the map starts on this year with every job (old ones with nothing on file faded, not hidden); Jobs opens on 60 days the first time, then the days you picked
// with 15 / 30 / 90 / This year / All; closing Jobs gives the same year map back; a day range picked on the map is kept.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context, { jobsDays: true });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const ready = async () => {
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.waitForTimeout(5000); // the HPD files load after the jobs
  };
  const days = () => page.locator('[data-hpd-smoke="fc-days-menu-btn"]').innerText().then((t) => t.replace(/\s+/g, " ").trim());
  const count = async () => Number(await page.locator('[data-hpd-smoke="fc-days-btn-count"]').innerText());
  const jobsTitle = async () => Number(/(\d+) on the map/.exec(await page.locator('[data-hpd-smoke="fc-jobs-title"]').innerText())[1]);
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await ready();
  assert.match(await days(), /Year ▾/, "the map starts on this year");
  const year = await count();
  // The year's jobs: the menu's "This year" count is what the map shows (old ones faded, not hidden).
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  const menuYear = Number(/(\d+)/.exec(await page.locator('[data-hpd-smoke="fc-days-count-year"]').innerText())[1]);
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  assert.equal(year, menuYear, `all of the year's jobs on the map (${year})`);
  assert.ok(await page.locator(".fc-dot-marker.is-old, .fc-label-marker.is-old").count() >= 0);
  // Jobs: opens on 60 days.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs"]').waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="fc-jobs-days-60"]').getAttribute("aria-pressed"), "true", "60 days when it opens");
  const sixty = await jobsTitle();
  await page.locator('[data-hpd-smoke="fc-jobs-days-15"]').click();
  const fifteen = await jobsTitle();
  await page.locator('[data-hpd-smoke="fc-jobs-days-all"]').click();
  const all = await jobsTitle();
  assert.ok(fifteen <= sixty && sixty <= all, `15 (${fifteen}) <= 60 (${sixty}) <= all (${all})`);
  // Closing Jobs: the same year map back (nothing disappears).
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  await page.waitForTimeout(1000);
  assert.equal(await count(), year);
  // Opened again: the days you picked last (All) are kept.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-jobs-days-all"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  // A day range picked on the map is kept after the app opens again.
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-days-last30"]').click();
  await page.waitForTimeout(800);
  assert.match(await days(), /30d ▾/);
  const thirty = await count();
  await page.reload({ waitUntil: "load" });
  await ready();
  assert.match(await days(), /30d ▾/, "30 days remembered");
  assert.equal(await count(), thirty);
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-days-year"]').click();
  await page.waitForTimeout(800);
  assert.equal(await count(), year);
  assert.deepEqual(errors, []);
  console.log(`PASS jobs and days: the map starts on the year (${year} jobs, old ones faded); Jobs opens on 60 days (${sixty}; 15: ${fifteen}, all: ${all}); closing Jobs gives the year map back; 30 days remembered`);
} finally {
  await browser.close();
}
