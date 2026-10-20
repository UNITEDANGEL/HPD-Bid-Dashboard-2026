// No flashing (owner, 20 Oct: "app keeps flashing between windows"): the fetcher deploys new data every ~10 minutes; that
// must not reload the app (it closed the open panel and redrew the map each time). Only a code change reloads it, and
// only when nothing is open. Sits on the map with the bids panel open for 30 minutes (fast clock) and counts reloads.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const built = await (await fetch(`${baseUrl}/version.json`)).json().catch(() => ({}));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  // What the live site says: a new deploy (new commit) with the same code (data only) -- then, later, new code.
  let live = { commit: "data001", code: built.code, number: "9999" };
  await context.route(/\/version\.json/, (r) => r.fulfill({ json: live }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let loads = 0;
  page.on("load", () => { loads++; });
  await page.clock.install();
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').waitFor();
  // Data-only deploys while you look at your bids: nothing reloads, the panel stays open.
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  await list.waitFor();
  const before = loads;
  for (let i = 0; i < 6; i++) {
    live = { ...live, commit: `data00${i + 2}` }; // the fetcher deployed again (data only)
    await page.clock.runFor(5 * 60 * 1000);
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); }); // back to the app
    await page.waitForTimeout(300);
  }
  assert.equal(loads, before, "no reload for data-only deploys");
  assert.ok(await list.isVisible(), "the bids panel stayed open");
  assert.equal(await page.locator('[data-hpd-smoke="fc-update-ready"]').count(), 0, "no Update button for data");
  // A real code change: the app updates itself (nothing open on the map).
  if (built.code) {
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.locator('[data-hpd-smoke="fc-notices-open"]').waitFor();
    const at = loads;
    live = { commit: "code001", code: "code001", number: "10000" };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForEvent("load", { timeout: 20000 }).catch(() => {});
    assert.equal(loads, at + 1, "a code change reloads once");
  }
  assert.deepEqual(errors, []);
  console.log(`PASS no flashing: 6 data-only deploys over 30 min with the bids panel open -> no reload, panel stayed open, no Update button; a code change (${built.code ? "tested" : "skipped: no code stamp"}) reloads once`);
  await context.close();
} finally {
  await browser.close();
}
