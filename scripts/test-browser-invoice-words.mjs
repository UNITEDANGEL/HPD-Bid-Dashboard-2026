// 📝 Your words on the invoice (plan item 29): on a partial job, what you told the helper ("How did it go?") fills
// "What work was completed?" on the paperwork, to check before anything is made; an older note (a gate code) doesn't.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 10 * 86400000).toISOString();
  await c.addInitScript(({ now, old }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-notes", JSON.stringify({ EQ15239: [{ text: "gate code 1234", at: old }, { text: "replaced 2 hinges, the door still needs a closer", at: now }] }));
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ EQ15239: { FieldOutcome: "PARTIAL_WORK", ActualWorkCompletionDate: now, FieldVisitHistory: [{ recordedAt: now, outcome: "PARTIAL_WORK", note: "" }] } }));
    sessionStorage.setItem("seeded", "1");
  }, { now, old });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/paperwork?job=EQ15239&media=all&outcome=partial_work_completed`, { waitUntil: "load", timeout: 180000 });
  const box = page.locator('[data-hpd-smoke="paperwork-partial-done"]');
  await box.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => (document.querySelector('[data-hpd-smoke="paperwork-partial-done"]')?.value || "").length > 0, null, { timeout: 20000 });
  assert.equal(await box.inputValue(), "REPLACED 2 HINGES, THE DOOR STILL NEEDS A CLOSER");
  assert.deepEqual(errors, []);
  console.log("PASS your words on the invoice: what you told the helper fills \"What work was completed?\" (not the older gate code note), to check first");
} finally {
  await browser.close();
}
