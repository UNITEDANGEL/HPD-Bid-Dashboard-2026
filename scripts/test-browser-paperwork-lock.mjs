// Browser test of locked paperwork at iPhone size, on a real job: once its paperwork was sent, the job
// card shows "🔒 Paperwork sent to HPD" and offers no outcome change; the paperwork page shows only the
// locked summary (no editing, no generate buttons); "Revise paperwork" asks why, keeps the sent version
// in the job's record and opens the job again; the job card then says it's being revised.
// The status server is faked: nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const job = "EQ26843";
const locked = {
  FieldOutcome: "NO_ACCESS_COMPLETE", WorkflowStatus: "NO_ACCESS_COMPLETE", StatusOverride: "No Access Complete",
  NoAccessFirstAttemptAt: "2026-09-25T13:00:00Z", NoAccessSecondAttemptAt: "2026-09-29T14:00:00Z", OutcomeLockedAt: "2026-09-29T14:00:00Z",
  PackageApprovedAt: "2026-10-02T15:00:00Z", PackageEmailedAt: "2026-10-02T15:01:00Z", PackageEmailedTo: "owner@example.test",
  PackageReviewStatus: "Approved", PackageDriveLink: "https://drive.google.com/drive/folders/test",
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  const posted = [];
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") posted.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.addInitScript(({ job, locked }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: locked }));
    sessionStorage.setItem("seeded", "1");
  }, { job, locked });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(d.type() === "prompt" ? "Got access on 10/20, work done" : undefined); });

  // Job card: locked banner, no outcome change.
  await page.goto(`${baseUrl}/map/?omo=${job}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 120000 });
  const banner = page.locator('[data-hpd-smoke="jc-lock"]');
  await banner.waitFor({ timeout: 10000 });
  assert.match(await banner.innerText(), /🔒 Paperwork sent to HPD 10\/2\/26[\s\S]*Emailed 10\/2\/26 to owner@example\.test[\s\S]*Locked/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-clear-outcome"]').count(), 0, "no outcome change on a locked job");

  // Paperwork page: only the locked summary.
  await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=no_access`, { waitUntil: "networkidle" });
  const lockedCard = page.locator('[data-hpd-smoke="paperwork-locked"]');
  await lockedCard.waitFor({ timeout: 30000 });
  const text = await lockedCard.innerText();
  assert.match(text, /🔒 Paperwork sent to HPD on 10\/2\/2026/);
  assert.match(text, /Emailed[\s\S]*owner@example\.test/);
  assert.match(text, /1st attempt[\s\S]*2nd attempt \/ refusal/);
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-generate-print"]').isVisible(), false, "no regenerating while locked");
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').isVisible().catch(() => false), false, "dates not editable while locked");

  // Revise: asks why, keeps the sent version, opens the job.
  await page.locator('[data-hpd-smoke="paperwork-revise"]').click();
  await lockedCard.waitFor({ state: "detached", timeout: 10000 });
  assert.match(dialogs.at(-1), /Revise the paperwork sent for EQ26843\?[\s\S]*sent version .* is kept/);
  const saved = await page.evaluate((job) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[job], job);
  assert.equal(saved.PackageApprovedAt, "");
  assert.equal(saved.PaperworkRevisions.length, 1);
  assert.deepEqual([saved.PaperworkRevisions[0].reason, saved.PaperworkRevisions[0].outcome, saved.PaperworkRevisions[0].approvedAt], ["Got access on 10/20, work done", "NO_ACCESS_COMPLETE", "2026-10-02T15:00:00Z"]);
  assert.equal(saved.PaperworkRevisions[0].dates.NoAccessSecondAttemptAt, "2026-09-29T14:00:00Z", "the sent dates are kept");
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-generate-print"]').isVisible(), true, "editing and generating are back");

  // Job card: being revised, outcome can change again.
  await page.goto(`${baseUrl}/map/?omo=${job}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 120000 });
  await banner.waitFor({ timeout: 10000 });
  assert.match(await banner.innerText(), /✏️ Paperwork being revised[\s\S]*sent 10\/2\/26 is kept[\s\S]*Got access on 10\/20, work done[\s\S]*Revised 1x/);
  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS paperwork lock: ${job} locked on the job card and paperwork page (no outcome change, no editing, no regenerating); Revise asked why, kept the sent version (outcome, dates, approval, email), reopened the job`);
} finally {
  await browser.close();
}
