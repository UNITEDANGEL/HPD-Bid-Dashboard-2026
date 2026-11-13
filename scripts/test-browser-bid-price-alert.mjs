// ⚠️ Price alerts by kind of work (plan, Next level recommendations, 12 Nov): when a kind of work keeps losing on
// price, or keeps winning far under the others, the bid's 💰 Best price box says so (bid_win_stats.json priceAlerts,
// scripts/build-bid-win-stats.mjs). A kind without an alert shows nothing. Alerts are faked here; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const stats = await (await fetch(`${baseUrl}/data/bid_win_stats.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const base = fetched.bids[0];
const cases = [
  { omo: "ER99911", description: "APT 3B BEDROOM WINDOW: REPLACE BROKEN WINDOW GLASS (1) PANE. ALL WORK MUST BE DONE AS PER HPD SPECIFICATIONS.", expect: /💡 .*your last 3 wins were about 31% under/ },
  { omo: "ER99912", description: "APT 5A ENTRANCE DOOR: REMOVE AND REPLACE DAMAGED APARTMENT ENTRANCE DOOR WITH NEW HOLLOW METAL DOOR AND FRAME (1). ALL WORK MUST BE DONE AS PER HPD SPECIFICATIONS.", expect: /⚠️ .*you lost 6 of your last 6 bids.*40% above the winner\. Price this one lower\./ },
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const seen = [];
  for (const k of cases) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [{ ...base, omo: k.omo, bidDue: tomorrow, bidDueTime: "11:00 AM", itbFile: "", description: k.description }] } }));
    await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
    // The alerts name the kind exactly as the app reads it; the test learns it from the page (first label of the job).
    let label = "";
    await c.route(/\/data\/bid_win_stats\.json/, (r) => r.fulfill({ json: { ...stats, priceAlerts: label ? [
      label === "window glass" ? { work: label, kind: "under", won: 3, underPct: 31 } : { work: label, kind: "losing", lost: 6, of: 6, gapPct: 40 },
    ] : [] } }));
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    label = k.omo === "ER99911" ? "window glass" : "new door";
    await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
    await openBidList(page);
    await page.locator('[data-hpd-smoke="fc-bid-row"]').first().click();
    await page.locator('[data-hpd-smoke="fc-bid-best"]').waitFor({ timeout: 60000 });
    const box = page.locator('[data-hpd-smoke="fc-bid-price-alert"]');
    await box.waitFor({ timeout: 20000 });
    const text = await box.innerText();
    if (process.env.SHOT) { await box.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT}/${k.omo}.png` }); }
    assert.match(text, k.expect);
    assert.deepEqual(errors, []);
    seen.push(`${k.omo}: "${text}"`);
    await c.close();
  }
  // A kind with no alert: nothing shown.
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [{ ...base, omo: "ER99913", bidDue: tomorrow, bidDueTime: "11:00 AM", itbFile: "", description: cases[1].description }] } }));
    await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
    await c.route(/\/data\/bid_win_stats\.json/, (r) => r.fulfill({ json: { ...stats, priceAlerts: [{ work: "window glass", kind: "under", won: 3, underPct: 31 }] } }));
    const page = await c.newPage();
    await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
    await openBidList(page);
    await page.locator('[data-hpd-smoke="fc-bid-row"]').first().click();
    await page.locator('[data-hpd-smoke="fc-bid-best"]').waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-hpd-smoke="fc-bid-price-alert"]').count(), 0, "door bid shows no window-glass alert");
    await c.close();
  }
  console.log(`PASS bid price alert: ${seen.join(" · ")} · a kind without an alert shows none`);
} finally {
  await browser.close();
}
