// 🏁 "Work done, send it" card on the Home screen (plan item 37, 24 Nov): finished jobs whose paperwork isn't sent, oldest first.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" });
  const job = (OMO, extra) => ({ OMO, AwardDate: day(-20), WorkCompletionDate: day(10), JobDescription: "PAINT", AwardAmount: "500", BuildingAddress: "1 Test Ave., 10472", ...extra });
  await page.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: [
    job("ZZ00021", { FieldOutcome: "WORK_COMPLETED", ActualWorkCompletionDate: day(-2) }),
    job("ZZ00022", { FieldOutcome: "PARTIAL_WORK", ActualWorkCompletionDate: day(-9) }),
    job("ZZ00023", { FieldOutcome: "WORK_COMPLETED", ActualWorkCompletionDate: day(-5) }),
    job("ZZ00024", {}),
    job("ZZ00025", { FieldOutcome: "REFUSED_ACCESS" }),
  ] }));
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { ZZ00023: { sentAt: "2026-11-20", count: 6 } } } }));
  await page.route("**/data/hpd_job_status.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  // The step saved in the app (status server) counts too: ZZ00024 marked work done today.
  await page.route("**/overrides*", (r) => r.fulfill({ json: { overrides: { ZZ00024: { FieldOutcome: "WORK_COMPLETED", OutcomeLockedAt: new Date().toISOString() } } } }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-done-send"]');
  await card.waitFor({ timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="home-done-send-row"]').length === 3, null, { timeout: 10000 });
  const rows = await card.locator('[data-hpd-smoke="home-done-send-row"]').allInnerTexts();
  assert.match(rows[0], /^ZZ00022: partial work 9 days ago/, rows.join(" | "));
  assert.match(rows[1], /^ZZ00021: work done 2 days ago/);
  assert.match(rows[2], /^ZZ00024: work done today/);
  assert.match(await card.innerText(), /3 finished jobs with paperwork not sent to HPD/);
  const href = await card.locator('[data-hpd-smoke="home-done-send-row"]').first().getAttribute("href");
  assert.ok(href && /ZZ00022/.test(href), `opens the paperwork: ${href}`);
  const box = await card.boundingBox();
  assert.ok(box && box.width <= 390, "card fits the iPhone width");
  console.log("PASS Home: work done, send it card");
} finally {
  await browser.close();
}
