// The flow between the map's screens at iPhone size (sideways and upright): every map button opens its own
// screen from any other screen and closes what was open; tapping it again (when it's on screen) closes it;
// every sheet's Close goes back to the map; HPD notices always opens the list (even after it was closed with
// the map still showing the notice jobs), and "Show all jobs" brings every job back.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const BUTTONS = {
  route: { tap: '[data-hpd-smoke="fc-route-open"]', open: '.fc-route-toggle[aria-expanded="true"]' },
  today: { tap: '.fc-map-fab[aria-label="Today\'s appointments"]', open: ".fc-appointment-agenda" },
  stats: { tap: '[data-hpd-smoke="fc-stats-open"]', open: '[data-hpd-smoke="fc-stats-sheet"]', close: '[data-hpd-smoke="fc-stats-sheet"] header button' },
  notices: { tap: '[data-hpd-smoke="fc-notices-open"]', open: '[data-hpd-smoke="fc-notice-chooser"]', close: '[data-hpd-smoke="fc-notice-chooser-close"]' },
  follow: { tap: '[data-hpd-smoke="fc-follow-open"]', open: '[data-hpd-smoke="fc-follow-sheet"]', close: '[data-hpd-smoke="fc-follow-sheet"] header button' },
  bids: { tap: '[data-hpd-smoke="fc-bids-open"]', open: '[data-hpd-smoke="fc-bids-list"]' },
  closeout: { tap: '[data-hpd-smoke="fc-close-out"]', open: '[data-hpd-smoke="fc-close-out-sheet"]', close: '[data-hpd-smoke="fc-close-out-sheet"] header button' },
  secondtry: { tap: '[data-hpd-smoke="fc-second-try"]', open: '[data-hpd-smoke="fc-second-try-sheet"]', close: '[data-hpd-smoke="fc-second-try-sheet"] header button' },
};
// 3 jobs with a visit result saved (ready to close out) and 2 waiting for the 2nd try (one due), on this phone.
const jobsFile = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
const seedOmos = jobsFile.filter((j) => j.OMO && !j.PackageApprovedAt).slice(40, 45).map((j) => j.OMO);
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const seed = Object.fromEntries(seedOmos.map((o, i) => [o, i < 3 ? { OMO: o, FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED" } : { OMO: o, FieldOutcome: "NO_ACCESS_1_WAITING_72H", NoAccessFirstAttemptAt: daysAgo(i === 3 ? 4 : 1) }]));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const report = [];
try {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const where = `${w}x${h}`;
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us|router\.project-osrm|routing\.openstreetmap/, (r) => r.fulfill({ status: 503, body: "" }));
    await context.addInitScript((s) => { if (!localStorage.getItem("hpd-job-workflow-overrides-v2")) localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify(s)); }, seed);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
    const isOpen = async (k) => (await page.locator(BUTTONS[k].open).count()) > 0 && (await page.locator(BUTTONS[k].open).first().isVisible());
    const openNow = async () => { const out = []; for (const k of Object.keys(BUTTONS)) if (await isOpen(k)) out.push(k); return out; };
    const reachable = (sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b || !b.offsetParent) return false; const r = b.getBoundingClientRect(); if (r.bottom > innerHeight || r.right > innerWidth) return false; return b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); }, sel);
    const backToMap = async () => {
      for (let i = 0; i < 4; i++) {
        const now = await openNow();
        if (!now.length) return;
        const k = now[0];
        if (BUTTONS[k].close && await page.locator(BUTTONS[k].close).first().isVisible()) await page.locator(BUTTONS[k].close).first().click();
        else await page.locator(BUTTONS[k].tap).click();
        await page.waitForTimeout(250);
      }
      assert.deepEqual(await openNow(), [], `${where}: back to the map`);
    };
    let pairs = 0, direct = 0;
    for (const a of Object.keys(BUTTONS)) {
      // From the map: opens, and only it.
      await backToMap();
      await page.locator(BUTTONS[a].tap).click();
      await page.locator(BUTTONS[a].open).first().waitFor({ timeout: 8000 });
      await page.waitForTimeout(250);
      assert.deepEqual(await openNow(), [a], `${where}: ${a} opens alone from the map`);
      // Tap again (if the button is still on screen): closes it.
      if (await reachable(BUTTONS[a].tap)) {
        await page.locator(BUTTONS[a].tap).click();
        await page.waitForTimeout(300);
        assert.equal(await isOpen(a), false, `${where}: second tap on ${a} closes it`);
        await page.locator(BUTTONS[a].tap).click();
        await page.locator(BUTTONS[a].open).first().waitFor({ timeout: 8000 });
      }
      // Every other button from here: if it's on screen, it opens its screen and closes this one.
      for (const b of Object.keys(BUTTONS)) {
        if (b === a) continue;
        if (!(await isOpen(a))) { await page.locator(BUTTONS[a].tap).click(); await page.locator(BUTTONS[a].open).first().waitFor({ timeout: 8000 }); }
        pairs++;
        if (!(await reachable(BUTTONS[b].tap))) continue; // covered by a full-screen sheet: its Close is the way out
        direct++;
        await page.locator(BUTTONS[b].tap).click();
        await page.locator(BUTTONS[b].open).first().waitFor({ timeout: 8000 });
        await page.waitForTimeout(250);
        assert.deepEqual(await openNow(), [b], `${where}: from ${a}, ${b} opens and ${a} closes`);
        await backToMap();
      }
    }
    // The two round buttons: counts, and the lists show the jobs.
    await backToMap();
    assert.equal(await page.locator('[data-hpd-smoke="fc-close-out-count"]').innerText(), "3");
    assert.equal(await page.locator('[data-hpd-smoke="fc-second-try-count"]').innerText(), "2");
    assert.equal(await page.locator(".fc-map-hints .fc-close-out, .fc-map-hints .fc-second-try").count(), 0, "no more bars across the map");
    await page.locator(BUTTONS.closeout.tap).click();
    assert.equal(await page.locator('[data-hpd-smoke="fc-close-out-sheet"] .fc-close-out-row').count(), 3);
    assert.equal(await page.locator('[data-hpd-smoke="fc-close-out-package"]').count(), 3, "Package link on each");
    // The list isn't a small box with its own scroll (it showed ~3 jobs): it uses the whole sheet.
    assert.ok(await page.locator('[data-hpd-smoke="fc-close-out-sheet"] .fc-work-list').evaluate((ul) => ul.scrollHeight <= ul.clientHeight + 2 && getComputedStyle(ul).maxHeight === "none"), "no inner scroll box");
    await page.locator(BUTTONS.closeout.close).click();
    await page.locator(BUTTONS.secondtry.tap).click();
    assert.match(await page.locator('[data-hpd-smoke="fc-second-try-sheet"] header').innerText(), /2 2nd tries · 1 due now/);
    // A job from the list opens its card (and the list closes).
    await page.locator('[data-hpd-smoke="fc-second-try-sheet"] li button').first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 8000 });
    assert.equal(await isOpen("secondtry"), false);
    assert.equal(await page.locator(".fc-work-fabs").count(), 0, "the round buttons hide behind a job card");
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
    // Notices: close the list (map still shows the notice jobs), tap Notices again -> the list opens.
    await backToMap();
    await page.locator(BUTTONS.notices.tap).click();
    await page.locator(BUTTONS.notices.open).waitFor();
    await page.locator(BUTTONS.notices.close).click();
    assert.equal(await page.locator(BUTTONS.notices.tap).getAttribute("aria-pressed"), "false");
    await page.locator(BUTTONS.notices.tap).click();
    await page.locator('[data-hpd-smoke="fc-notice-pick-list"]').click();
    await page.locator('[data-hpd-smoke="fc-notices-sheet"]').waitFor({ timeout: 5000 });
    // Show all jobs: list closes, every job is back on the map.
    const before = await page.locator(".fc-pin, .leaflet-marker-icon").count();
    await page.locator('[data-hpd-smoke="fc-notices-show-all"]').click();
    await page.waitForTimeout(800);
    assert.equal(await isOpen("notices"), false);
    assert.ok((await page.locator(".fc-pin, .leaflet-marker-icon").count()) > before, `${where}: all jobs back on the map`);
    // A job card, then a map button: the card closes.
    await page.locator(".fc-pin").first().click({ force: true });
    await page.waitForTimeout(500);
    if (await page.locator("#fc-job-card").count() && await reachable(BUTTONS.bids.tap)) {
      await page.locator(BUTTONS.bids.tap).click();
      await page.locator(BUTTONS.bids.open).waitFor({ timeout: 5000 });
      assert.equal(await page.locator("#fc-job-card:visible").count(), 0, `${where}: the job card closes when Bids opens`);
    }
    assert.deepEqual(errors, []);
    report.push(`${where}: ${pairs} button pairs (${direct} tapped directly, the rest via Close)`);
    await context.close();
  }
  console.log(`PASS flow: every map button opens its screen alone, a second tap closes it, from every other screen it switches cleanly; Close out (3) and 2nd try (2, 1 due) are round buttons whose lists open jobs; Notices always opens the list, Show all jobs brings the jobs back; ${report.join("; ")}`);
} finally {
  await browser.close();
}
