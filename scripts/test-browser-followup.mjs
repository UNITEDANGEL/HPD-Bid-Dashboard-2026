// Browser test of the follow-up report at iPhone size: the counts match an independent calculation from
// the data files, a row opens the job card with its key dates, a tile filters the map to those jobs,
// the quick filters show the same counts, and ✕ clears the filter. The status server is faked (no phone
// statuses), so the numbers come from the job file, HPD's status file and the paperwork-sent file.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const { followUpReport } = await loadLib("job-followup");
const get = async (f) => (await fetch(`${baseUrl}/data/${f}`)).json();
const [jobs, hpd, sent] = await Promise.all([get("COA_Fetcher_2026.json"), get("hpd_job_status.json"), get("sent_paperwork.json")]);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const hpdFor = Object.fromEntries(jobs.map((j) => [j.OMO, { closedReason: hpd.jobs[j.OMO]?.closedReason || "" }]));
const asked = await get("hpd_requests.json");
const expected = followUpReport(jobs, hpdFor, sent.jobs, today, asked.jobs);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 20, null, { timeout: 120000 });
  // The HPD / paperwork files load after the jobs: wait for the badge to settle.
  await page.waitForTimeout(2500);

  await page.locator('[data-hpd-smoke="fc-more-open"]').click(); await page.locator('[data-hpd-smoke="fc-follow-open"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-follow-sheet"]');
  await sheet.waitFor({ timeout: 10000 });
  const tile = async (key) => Number((await page.locator(`[data-hpd-smoke="fc-follow-tile-${key}"] b`).innerText()).trim());
  const shown = { hpdAsked: await tile("hpd-asked"), overdue: await tile("overdue"), dueWeek: await tile("due-week"), recent: await tile("recent"), waitingOnHpd: await tile("sent"), hpdClosed: await tile("hpd-closed") };
  const want = { hpdAsked: expected.counts.hpdAsked, overdue: expected.counts.overdue, dueWeek: expected.counts.dueWeek, recent: expected.counts.recent, waitingOnHpd: expected.counts.waitingOnHpd, hpdClosed: expected.counts.hpdClosed };
  assert.deepEqual(shown, want, "report counts match the data files");
  const overdueList = page.locator('[data-hpd-smoke="fc-follow-overdue-list"] li:not(.fc-follow-group)');
  // Grouped by how late: the first group is the most recent one.
  const groups = await page.locator('[data-hpd-smoke="fc-follow-overdue-list"] [data-hpd-smoke="fc-follow-group"]').allInnerTexts();
  assert.ok(groups.length >= 1 && /overdue/i.test(groups[0]), `age groups shown (${groups.join(" / ")})`);
  assert.equal(await page.locator('[data-hpd-smoke="fc-follow-hpd-asked-list"] li').count(), expected.hpdAsked.length, "every open HPD request listed first");
  assert.equal(await overdueList.count(), Math.min(25, expected.overdue.length), "first 25 overdue shown");
  if (expected.overdue.length) {
    const first = expected.overdue[0];
    assert.match(await overdueList.first().innerText(), new RegExp(`${first.omo}[\\s\\S]*${-first.daysLeft}d overdue`), "most recently overdue first");
    // A row opens that job's card with its key dates.
    await overdueList.first().locator("button").click();
    await page.locator('[data-hpd-smoke="jc-key-dates"]').waitFor({ timeout: 10000 });
    assert.match(await page.locator('[data-hpd-smoke="jc-key-dates"]').innerText(), new RegExp(`${-first.daysLeft} days overdue`));
    await page.locator("#fc-job-card button[aria-label='Close']").first().click().catch(() => {});
  }

  // A tile filters the map: "Showing: Overdue · N jobs", the quick filters agree, ✕ clears it.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click(); await page.locator('[data-hpd-smoke="fc-follow-open"]').click();
  await page.locator('[data-hpd-smoke="fc-follow-tile-overdue"]').click();
  const active = page.locator('[data-hpd-smoke="fc-follow-active"]');
  await active.waitFor({ timeout: 5000 });
  assert.match(await active.innerText(), new RegExp(`Showing: Overdue · ${expected.counts.overdue} jobs`));
  await page.locator('[data-hpd-smoke="fc-filter-button"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-follow-overdue"]').innerText(), new RegExp(`Overdue\\s*${expected.counts.overdue}`));
  assert.equal(await page.locator('[data-hpd-smoke="fc-follow-overdue"]').getAttribute("aria-pressed"), "true");
  await page.locator('[data-hpd-smoke="fc-filter-button"]').click();
  await active.locator("button").click();
  assert.equal(await active.count(), 0, "✕ clears the follow-up filter");
  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS follow-up report: ${shown.overdue} overdue, ${shown.dueWeek} due this week, ${shown.recent} awarded in 30 days, ${shown.waitingOnHpd} waiting on HPD, ${shown.hpdClosed} closed at HPD (match the data files); row opens the job card; tile filters the map; ✕ clears it`);
} finally {
  await browser.close();
}
