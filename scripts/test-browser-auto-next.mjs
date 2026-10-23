// The day flows on by itself (owner, 23 Oct: "everything needs to flow auto"), at iPhone size with real jobs on
// Today's route: a job finished with its paperwork approved counts down "Going to the next stop … in 8s", then the
// map glides to the next stop and opens its card. "Stay here" stops it. Not approved yet: no countdown (the paperwork
// comes first). Saved job steps live on this test browser only; the live status server is answered here.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const route = ["EQ18710", "EQ15239", "EQ24465"];
const finished = (approved) => ({ FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: new Date().toISOString(), outcome: "WORK_COMPLETED", note: "" }], ...(approved ? { PackageApprovedAt: new Date().toISOString(), PackageReviewStatus: "approved" } : {}) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function open(job, approved) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.addInitScript(({ job, state, route, today }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: state }));
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: route, origin: null }));
    sessionStorage.setItem("seeded", "1");
  }, { job, state: finished(approved), route, today });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?omo=${encodeURIComponent(job)}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 120000 });
  await page.locator('[data-hpd-smoke="jc-next-job"]').waitFor({ timeout: 30000 });
  return { context, page, errors };
}

try {
  // Not approved yet: the next stop is offered, nothing moves by itself.
  {
    const { context, page, errors } = await open(route[0], false);
    await page.waitForTimeout(2000);
    assert.equal(await page.locator('[data-hpd-smoke="jc-auto-next"]').count(), 0, "no countdown before the paperwork is approved");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // Approved: countdown, then the next stop opens by itself.
  {
    const { context, page, errors } = await open(route[0], true);
    const box = page.locator('[data-hpd-smoke="jc-auto-next"]');
    await box.waitFor({ timeout: 15000 });
    assert.match(await box.innerText(), new RegExp(`Going to the next stop, ${route[1]}, in \\d+s`));
    await box.scrollIntoViewIfNeeded();
    if (shots) await page.screenshot({ path: `${shots}/auto-next-countdown.png` });
    await page.waitForFunction((o) => (document.querySelector("#fc-job-card")?.textContent || "").includes(o) && !document.querySelector('[data-hpd-smoke="jc-auto-next"]'), route[1], { timeout: 20000 });
    assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(route[1]), "the next stop's card is open");
    if (shots) await page.screenshot({ path: `${shots}/auto-next-opened.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  // "Stay here" stops it.
  {
    const { context, page, errors } = await open(route[0], true);
    await page.locator('[data-hpd-smoke="jc-auto-next-stay"]').click({ timeout: 15000 });
    await page.waitForTimeout(10000);
    assert.equal(await page.locator('[data-hpd-smoke="jc-auto-next"]').count(), 0);
    assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(route[0]), "stayed on this job");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS auto next stop: ${route[0]} not approved -> no countdown; approved -> "Going to the next stop, ${route[1]}" counts down and opens ${route[1]}; "Stay here" keeps ${route[0]}`);
} finally {
  await browser.close();
}
