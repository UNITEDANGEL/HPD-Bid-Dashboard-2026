// ↩ Pick up where you left off (owner, 9 Nov: "everything should pick up where I left off ... test all, no future
// errors"). On the paperwork page: pick what happened and enter the dates, reload (or come back to the app) and they're
// still there with a "Picked up where you left off" note; opened for something else, the old draft isn't forced on it;
// "Start over" clears it.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const JOB = "ER05395";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // No access, with the two attempt dates.
  await page.goto(`${baseUrl}/paperwork?job=${JOB}&outcome=no_access`, { waitUntil: "networkidle" });
  await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-resumed"]').count(), 0, "nothing to pick up the first time");
  await page.fill('[data-hpd-smoke="paperwork-attempt-1"]', "2026-10-01");
  await page.fill('[data-hpd-smoke="paperwork-attempt-2"]', "2026-10-05");
  await page.waitForTimeout(900);

  // Back to the job (no outcome in the link this time): the outcome and the dates come back.
  await page.goto(`${baseUrl}/paperwork?job=${JOB}`, { waitUntil: "networkidle" });
  const note = page.locator('[data-hpd-smoke="paperwork-resumed"]');
  await note.waitFor({ timeout: 30000 });
  assert.match(await note.innerText(), /Picked up where you left off/);
  await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-attempt-1"]').inputValue(), "2026-10-01");
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').inputValue(), "2026-10-05");

  // Opened for work completed instead: the no-access draft isn't put on it.
  await page.goto(`${baseUrl}/paperwork?job=${JOB}&outcome=work_completed`, { waitUntil: "networkidle" });
  await page.locator('[data-hpd-smoke="paperwork-work-complete"]').waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-resumed"]').count(), 0);

  // Start over: cleared.
  await page.goto(`${baseUrl}/paperwork?job=${JOB}&outcome=no_access`, { waitUntil: "networkidle" });
  await note.waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="paperwork-start-over"]').click();
  await page.waitForLoadState("networkidle");
  await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-resumed"]').count(), 0, "Start over cleared it");
  assert.notEqual(await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').inputValue(), "2026-10-05");
  assert.deepEqual(errors, []);
  console.log("PASS paperwork resume: the outcome and dates you entered come back when you open the job again, not forced on a different outcome, Start over clears them");
} finally {
  await browser.close();
}
