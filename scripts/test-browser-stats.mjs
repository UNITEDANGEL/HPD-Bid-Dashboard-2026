// Browser test of "My stats" on the field map, the way it is used on an iPhone: tap the chart button,
// read every number, switch periods. A known day is loaded onto the phone (local storage only) and
// the live status server is answered here, so no real job is changed.
// Needs the app running (npm run dev, or the built site). BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
// Visits "m minutes ago", kept inside today (New York) even in the first hour after midnight.
const nyMinutesNow = (() => { const [h, mi] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number); return h * 60 + mi; })();
const BASE = nyMinutesNow < 60 ? Date.now() + (61 - nyMinutesNow) * 60000 : Date.now();
const minutesAgo = (m) => new Date(BASE - m * 60000).toISOString();
const entry = (outcome, at, note = "") => ({ recordedAt: at, outcome, note });

// Today: a $3,400 job completed, a no-access job under $2,000 on its 2nd try ($100 service call),
// a refused job of $2,000 or more ($300), a no-access 1st try (not billable yet), and the test job
// (never counted). Expected earnings: $3,400 + $100 + $300 = $3,800.
const day = {
  EQ21462: { FieldArrivedAt: minutesAgo(50), FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED", FieldVisitHistory: [entry("WORK_COMPLETED", minutesAgo(40))] },
  EQ14157: { FieldOutcome: "NO_ACCESS_1_WAITING_72H", WorkflowStatus: "NO_ACCESS_1_WAITING_72H", NoAccessFirstAttemptAt: "2026-01-02", NoAccessSecondAttemptAt: minutesAgo(30),
    FieldVisitHistory: [entry("NO_ACCESS_1_WAITING_72H", "2026-01-02T15:00:00Z"), entry("NO_ACCESS_1_WAITING_72H", minutesAgo(30), "2nd try: no access")] },
  EQ13990: { FieldOutcome: "REFUSED_ACCESS", WorkflowStatus: "REFUSED_ACCESS", FieldVisitHistory: [entry("REFUSED_ACCESS", minutesAgo(20))] },
  EQ16020: { FieldOutcome: "NO_ACCESS_1_WAITING_72H", WorkflowStatus: "NO_ACCESS_1_WAITING_72H", NoAccessFirstAttemptAt: minutesAgo(10), FieldVisitHistory: [entry("NO_ACCESS_1_WAITING_72H", minutesAgo(10))] },
  "TEST-0001": { FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED", FieldVisitHistory: [entry("WORK_COMPLETED", minutesAgo(5))] },
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let statusServerCalls = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (route) => {
    statusServerCalls += 1;
    return route.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.addInitScript((overrides) => {
    if (!sessionStorage.getItem("stats-test-seeded")) {
      localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify(overrides));
      sessionStorage.setItem("stats-test-seeded", "1");
    }
  }, day);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });

  // The chart button is on the map itself (iPhone size), no menu needed.
  const button = page.locator('[data-hpd-smoke="fc-stats-open"]');
  await button.waitFor({ state: "visible", timeout: 120000 });
  const box = await button.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, "stats button must be on screen");
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  // The map's close-out list (the test job is listed there for practice; stats leave it out).
  // Close out is a tab in the Jobs list (21 Oct).
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const closeOut = page.locator('[data-hpd-smoke="fc-jobs"]');
  await closeOut.waitFor({ timeout: 10000 });
  await closeOut.locator('[data-hpd-smoke="fc-jobs-tab-closeout"]').click();
  const closeOutIds = await closeOut.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  await closeOut.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  const realCloseOut = closeOutIds.filter((id) => id !== "TEST-0001");
  assert.ok(["EQ21462", "EQ14157", "EQ13990"].every((id) => realCloseOut.includes(id)), `close-out list ${closeOutIds}`);
  await button.click();

  const sheet = page.locator('[data-hpd-smoke="fc-stats-sheet"]');
  await sheet.waitFor({ timeout: 20000 });
  const read = async () => ({
    label: await sheet.locator(".fc-stats-label").innerText(),
    earned: (await sheet.locator('[data-hpd-smoke="fc-stats-earned"]').innerText()).replace(/\s+/g, " "),
    counts: Object.fromEntries((await sheet.locator('[data-hpd-smoke="fc-stats-counts"] span').allInnerTexts()).map((t) => { const [n, ...rest] = t.trim().split(/\s+/); return [rest.join(" "), Number(n)]; })),
    open: (await sheet.locator('[data-hpd-smoke="fc-stats-open-work"]').innerText()).replace(/\s+/g, " "),
    bars: await sheet.locator(".fc-stats-bars > div").count(),
  });

  const today = await read();
  console.log("Today:", JSON.stringify(today));
  assert.match(today.label, /^Today · /);
  assert.match(today.earned, /^\$3,800 earned · 1 job finished \$3,400 \+ 2 service calls \$400/, today.earned);
  assert.deepEqual(today.counts, { Visited: 4, Completed: 1, Partial: 0, "No access": 2, Refused: 1, Emailed: 0 });
  assert.equal(today.bars, 0, "no per-day chart for a single day");

  // "To close out" on the sheet matches the map's own close-out pill.
  const sheetCloseOut = Number((today.open.match(/(\d+) To close out/) || [])[1]);
  assert.equal(sheetCloseOut, realCloseOut.length, `sheet close-out ${sheetCloseOut} vs map list ${realCloseOut}`);

  for (const period of ["week", "month"]) {
    await sheet.locator(`[data-hpd-smoke="fc-stats-period-${period}"]`).click();
    const view = await read();
    console.log(`${period}:`, JSON.stringify(view));
    assert.match(view.label, period === "week" ? /^This week · / : /^This month · /);
    assert.match(view.earned, /^\$3,800 earned/, `${period} includes today's $3,800`);
    assert.equal(view.counts.Visited, 4);
    // One bar per day so far in the period; a period that is only today has no chart.
    const nyToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const [y, m, d] = nyToday.split("-").map(Number);
    const daysSoFar = period === "week" ? ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1 : d;
    assert.equal(view.bars, daysSoFar > 1 ? daysSoFar : 0, `${period} bars`);
  }

  await sheet.locator("header button").click();
  await sheet.waitFor({ state: "detached", timeout: 10000 });
  await button.waitFor({ state: "visible" });
  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS stats: button on the map, $3,800 = $3,400 work + $100 + $300 service calls, counts, close-outs, periods; status server calls answered locally: ${statusServerCalls}`);
} finally {
  await browser.close();
}
