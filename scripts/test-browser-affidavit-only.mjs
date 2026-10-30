// Just the affidavit (owner, 30 Oct: "when I arrive that's fine, I start the job, but sometimes I just want to fill up the
// affidavit: an option there for the outcome, what happened, refused access, no access ...") at iPhone size: before
// I have arrived the job card offers the outcomes; Refused access asks the date and who, Save, and the package is next
// (arrive / start visit skipped, no Go there). Status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"]').fill(JOB);
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  // Not arrived: the shortcut is there with every outcome.
  const box = page.locator('[data-hpd-smoke="jc-affidavit-only"]');
  await box.waitFor({ timeout: 20000 });
  assert.equal(await page.locator('[data-hpd-smoke="jc-step-arrived"]').count(), 1, "I have arrived still there");
  const text = await box.innerText();
  for (const t of ["Refused access", "No access", "by others", "Work completed"]) assert.match(text, new RegExp(t, "i"), `${t} offered`);
  // Refused access: the date and who, right there.
  await page.locator('[data-hpd-smoke="jc-affidavit-refused_access"]').click();
  await box.locator('[data-hpd-smoke="jc-refused-questions"]').waitFor({ timeout: 5000 });
  assert.equal(await box.locator('[data-hpd-smoke="jc-outcome-date"]').count(), 1, "date asked");
  // Tap again: closed (changed my mind).
  await page.locator('[data-hpd-smoke="jc-affidavit-refused_access"]').click();
  assert.equal(await box.locator('[data-hpd-smoke="jc-refused-questions"]').count(), 0, "closed on a 2nd tap");
  await page.locator('[data-hpd-smoke="jc-affidavit-refused_access"]').click();
  await box.locator("button", { hasText: "Male, tall, dark hair" }).click();
  if (shots) await box.screenshot({ path: `${shots}/affidavit-only.png` });
  await box.locator('[data-hpd-smoke="jc-step-save-outcome"]').click();
  await page.waitForFunction((j) => (JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j] || {}).FieldOutcome === "REFUSED_ACCESS", JOB, { timeout: 10000 });
  // Saved: the shortcut goes, arrive / visit read Skipped, the package is the next step.
  await box.waitFor({ state: "detached", timeout: 5000 });
  await page.locator('[data-hpd-smoke="jc-step-package"]').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="jc-step-arrived"]').count(), 0, "arrive not asked");
  assert.equal(await page.locator('[data-hpd-smoke="jc-step-travel"]').count(), 0, "no Go there");
  assert.match(await page.locator('[data-hpd-smoke="jc-steps"]').innerText(), /Skipped: outcome saved for the affidavit/);
  assert.match(await page.locator('[data-hpd-smoke="jc-step-package"]').getAttribute("href"), /paperwork/);
  if (shots) await page.locator('[data-hpd-smoke="jc-steps"]').screenshot({ path: `${shots}/affidavit-only-saved.png` });
  assert.deepEqual(errors, []);
  console.log("PASS just the affidavit: before arriving the job card offers Refused access / No access / Done by others / Work completed; Refused access asks the date and who; saved, the package is next (arrive and visit skipped)");
  await c.close();
} finally {
  await browser.close();
}
