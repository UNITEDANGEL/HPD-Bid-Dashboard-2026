// Browser test at iPhone size: a job with work completed shows "what is left" on its card (photos, affidavit,
// invoice) and the Next button opens the first missing step. The status server is faked: nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const job = "EQ26843";
const done = {
  FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED", StatusOverride: "Work completed",
  ActualWorkCompletionDate: "2026-10-01T15:00:00Z",
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.addInitScript(({ job, done }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: done }));
    sessionStorage.setItem("seeded", "1");
  }, { job, done });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?omo=${job}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 120000 });
  const left = page.locator('[data-hpd-smoke="jc-left"]');
  await left.waitFor({ timeout: 10000 });
  const text = await left.innerText();
  assert.match(text, /things? left for this job/);
  assert.match(text, /Photos: Missing before and after photos/);
  assert.match(text, /Affidavit: Not approved yet/);
  assert.match(text, /Invoice: (Sent to HPD|Not sent yet)/);
  const go = page.locator('[data-hpd-smoke="jc-left-go"]');
  assert.match(await go.innerText(), /Next: Photos/);
  assert.deepEqual(errors, []);
  console.log("paperwork-left browser test passed");
} finally {
  await browser.close();
}
