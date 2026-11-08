// 📅 Jobs on the map (owner, 8 Nov: "every time I click Jobs and close, the jobs disappear"; "when I click Jobs it
// should show me the jobs, not the list first; I can choose to see the list"; "by default 60 days, then I can pick any
// day"): the map starts on this year; Jobs opens on the map (the list folded to its bar) with the last 60 days; Close
// keeps those jobs on the map with "🔨 Your Jobs list · N jobs", ✕ All gives the whole year back; the days picked in
// Jobs and on the map are kept.
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
  // Jobs: on the map first, the list folded; the last 60 days.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-jobs"]');
  await sheet.waitFor();
  assert.ok(await sheet.evaluate((e) => e.classList.contains("is-mini")), "the map first, not the list");
  assert.equal(await page.locator('[data-hpd-smoke="fc-jobs-days-60"]').getAttribute("aria-pressed"), "true", "60 days");
  const sixty = await jobsTitle();
  await page.locator('[data-hpd-smoke="fc-jobs-days-15"]').click();
  const fifteen = await jobsTitle();
  await page.locator('[data-hpd-smoke="fc-jobs-days-60"]').click();
  assert.ok(fifteen <= sixty, `15 (${fifteen}) <= 60 (${sixty})`);
  // ☰ List when you want it; 🗺 Map folds it again.
  await page.locator('[data-hpd-smoke="fc-jobs-fold"]').click();
  assert.ok(!(await sheet.evaluate((e) => e.classList.contains("is-mini"))));
  assert.equal(await page.locator('[data-hpd-smoke="fc-jobs-row"]').count(), sixty);
  await page.locator('[data-hpd-smoke="fc-jobs-fold"]').click();
  // Close: the same jobs stay on the map.
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  await page.waitForTimeout(1000);
  const kept = page.locator('[data-hpd-smoke="fc-jobs-kept"]');
  await kept.waitFor({ timeout: 5000 });
  assert.match(await kept.innerText(), new RegExp(`Your Jobs list · ${sixty} job`));
  assert.equal(await count(), sixty, "the jobs you saw stay on the map");
  // ✕ All: the whole year again.
  await page.locator('[data-hpd-smoke="fc-jobs-kept-x"]').click();
  await page.waitForTimeout(800);
  assert.equal(await kept.count(), 0);
  assert.equal(await count(), year);
  // Days picked on the map are kept after the app opens again; picking days also ends the Jobs view.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  await kept.waitFor({ timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-days-last30"]').click();
  await page.waitForTimeout(800);
  assert.equal(await kept.count(), 0, "picking days shows the map's days");
  assert.match(await days(), /30d ▾/);
  const thirty = await count();
  await page.reload({ waitUntil: "load" });
  await ready();
  assert.match(await days(), /30d ▾/, "30 days remembered");
  assert.equal(await count(), thirty);
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-days-year"]').click();
  assert.deepEqual(errors, []);
  console.log(`PASS jobs on the map: the map starts on the year (${year}); Jobs opens on the map with 60 days (${sixty}; 15: ${fifteen}), ☰ List when wanted; Close keeps the ${sixty} on the map, ✕ All gives ${year} back; 30 days remembered`);
} finally {
  await browser.close();
}
