// 🏢 Building history on the job card (idea list): ER02330 at 1020 Boynton Avenue, with two past jobs there (one spelled
// "Ave.", one at the building next door that must not show), says "This building: 2 other jobs here, last Dec 2024 ·
// 1 no access"; open it: each past job with date, apartment, money and how it ended.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const JOB = "ER02330";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route("**/data/jobs_2024_2025.json", (r) => r.fulfill({ json: { jobs: [
    { OMO: "EP14949", BuildingAddress: "1020 Boynton Ave., 10472", ApartmentUnit: "4C", AwardDate: "12/24/24", AwardAmount: "1450", JobDescription: "REPLACE BATHROOM CEILING - more", HpdClosedReason: "No Access", Paid: "not paid yet" },
    { OMO: "EO34131", BuildingAddress: "1020 BOYNTON AVENUE, 10472", AwardDate: "06/05/24", AwardAmount: "900", JobDescription: "Entrance door closer", HpdClosedReason: "OMO Completed", Paid: "paid", PaidAmount: 900 },
    { OMO: "EO99999", BuildingAddress: "1022 BOYNTON AVENUE, 10472", AwardDate: "06/05/24", JobDescription: "next door" },
  ] } }));
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(JOB).catch(() => {});
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  const box = page.locator('[data-hpd-smoke="jc-building"]');
  await box.waitFor({ timeout: 15000 });
  const head = await box.locator("summary").innerText();
  assert.match(head, /🏢 This building: 2 other jobs here, last Dec 2024 · 1 no access/);
  await box.locator("summary").click();
  const rows = box.locator('[data-hpd-smoke="jc-building-row"]');
  assert.equal(await rows.count(), 2);
  const all = (await rows.allInnerTexts()).join("\n");
  assert.match(all, /EP14949 · Dec 24, 2024 · apt 4C · \$1,450\s+replace bathroom ceiling · HPD: No Access · not paid yet/);
  assert.match(all, /HPD: No Access/);
  assert.match(all, /HPD: OMO Completed/);
  assert.ok(!all.includes(JOB) && !all.includes("EO99999"), "not the job itself, not next door");
  assert.deepEqual(errors, []);
  console.log(`PASS building history: ${head.replace(/\s+/g, " ")}; ${await rows.count()} past jobs with date, money and how it ended`);
} finally {
  await browser.close();
}
