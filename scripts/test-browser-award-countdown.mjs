// ⏳ "Days left to finish" card on the Home screen (plan, 21 Nov): open awarded jobs, late and closest first; a tap opens the job.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const day = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" }); };
  const job = (OMO, award, due) => ({ OMO, AwardDate: day(award), WorkCompletionDate: day(due), JobDescription: "PAINT", AwardAmount: "500" });
  await page.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: [
    job("ZZ00003", -10, 6), job("ZZ00001", -20, -3), job("ZZ00002", -5, 1), job("ZZ00009", -5, 2), job("TEST-0001", -1, 1),
  ] }));
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { ZZ00009: { sentAt: "2026-11-20", count: 6 } } } }));
  await page.route("**/data/hpd_job_status.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-countdown"]');
  await card.waitFor({ timeout: 10000 });
  const rows = await card.locator('[data-hpd-smoke="home-countdown-row"]').allInnerTexts();
  assert.equal(rows.length, 3, rows.join(" | "));
  assert.match(rows[0], /^ZZ00001: 3 days late/);
  assert.match(rows[1], /^ZZ00002: 1 day left/);
  assert.match(rows[2], /^ZZ00003: 6 days left/);
  assert.match(await card.innerText(), /3 awarded jobs not sent yet/);
  assert.equal(await card.locator('[data-hpd-smoke="home-countdown-row"]').first().getAttribute("href"), "/map/?omo=ZZ00001");
  const box = await card.boundingBox();
  assert.ok(box && box.width <= 390, "card fits the iPhone width");
  // 📅 Finish dates calendar (plan item 20): opens to this month; ZZ00003 (due in 6 days) is on its day; a tap lists it.
  const cal = page.locator('[data-hpd-smoke="home-finish-cal"]');
  await cal.locator('[data-hpd-smoke="home-finish-cal-toggle"]').click();
  const iso = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (iso(6).slice(0, 7) !== iso(0).slice(0, 7)) await cal.locator('[data-hpd-smoke="home-finish-cal-next"]').click();
  const cell = cal.locator(`[data-hpd-smoke="home-finish-cal-day"][data-day="${iso(6)}"]`);
  assert.equal(await cell.getAttribute("data-count"), "1");
  await cell.click();
  const jobs = await cal.locator('[data-hpd-smoke="home-finish-cal-job"]').allInnerTexts();
  assert.deepEqual(jobs.map((t) => t.replace(/\s*›$/, "")), ["ZZ00003: 6 days left"]);
  assert.equal(await cal.locator('[data-hpd-smoke="home-finish-cal-job"]').getAttribute("href"), "/map/?omo=ZZ00003");
  const calBox = await cal.boundingBox();
  assert.ok(calBox && calBox.width <= 390, `calendar fits the iPhone width (${calBox?.width})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "no sideways scroll");
  console.log("award-countdown browser test passed");
} finally {
  await browser.close();
}
