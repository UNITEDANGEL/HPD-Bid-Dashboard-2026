// No pop-up boxes (owner, 19 Oct: the iPhone home-screen app blocks them, so those buttons did nothing): "Change outcome"
// on a job card takes two taps on the button itself; nothing opens a confirm()/prompt() box.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const job = "EQ26843";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.addInitScript(({ job }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: { FieldOutcome: "REFUSED_ACCESS", WorkflowStatus: "REFUSED_ACCESS", StatusOverride: "Refused Access", RefusalDate: "2026-10-10T14:00:00Z", OutcomeLockedAt: "2026-10-10T14:00:00Z" } }));
    sessionStorage.setItem("seeded", "1");
  }, { job });
  const page = await context.newPage();
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=${job}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 120000 });
  const btn = page.locator('[data-hpd-smoke="fc-clear-outcome"]');
  await btn.waitFor({ timeout: 15000 });
  await btn.click();
  assert.match(await btn.innerText(), /Tap again: clear the outcome/);
  await btn.click();
  await page.waitForFunction((j) => { const o = JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j] || {}; return !/REFUSED/i.test(String(o.FieldOutcome || "")); }, job, { timeout: 10000 });
  assert.deepEqual(dialogs, [], "no pop-up boxes");
  assert.deepEqual(errors, []);
  console.log(`PASS two taps: ${job} "Change outcome" armed on the first tap, cleared the outcome on the second, no pop-up boxes`);
  await context.close();
} finally {
  await browser.close();
}
