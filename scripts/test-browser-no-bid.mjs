// No bid at iPhone size: open an invitation, tap 🚫 No bid, pick "Too far" -> the bid says No bid: Too far,
// the list row and the map pin show it, the checklist has one fewer to bid; the status server gets
// NOBID-<OMO> (other phones see it). Undo brings it back. Sends no fax.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.slice(0, 5).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const posted = {};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, async (r) => {
    if (r.request().method() === "POST" && /\/override$/.test(r.request().url())) { const b = r.request().postDataJSON(); posted[b.key] = b.patch; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  const omo = bids[0].omo;
  const row = list.locator("ol > li", { hasText: omo }).first();
  await row.waitFor({ timeout: 30000 });
  const before = (await page.locator('[data-hpd-smoke="fc-checklist-toggle"] b').innerText()).trim();
  assert.match(before, /0 of 5 sent/);
  await row.locator("button").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.locator('[data-hpd-smoke="fc-nobid"]').click();
  await sheet.locator('[data-hpd-smoke="fc-nobid-reason"]', { hasText: "Too far" }).click();
  await sheet.locator('[data-hpd-smoke="fc-nobid-set"]').waitFor({ timeout: 5000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-nobid-set"]').innerText(), /No bid: Too far/);
  assert.equal(posted[`NOBID-${omo}`]?.reason, "Too far", "reaches the status server");
  assert.equal(posted[`BID-${omo}`], undefined, "no bid record (no fax) was made");
  await sheet.locator("header button").first().click();
  await openBidList(page);
  assert.match(await row.innerText(), /🚫 No bid/);
  assert.match(await page.locator('[data-hpd-smoke="fc-checklist-toggle"] b').innerText(), /0 of 4 sent/, "one fewer to bid");
  if (Number.isFinite(bids[0].lat)) assert.equal(await page.locator(`.fc-bid-pin.is-nobid[title^="${omo} "]`).count(), 1, "grey pin");
  // Kept after reload; Undo brings it back.
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load" });
  await openBidList(page);
  await row.waitFor();
  assert.match(await row.innerText(), /🚫 No bid/);
  await row.locator("button").first().click();
  await sheet.locator('[data-hpd-smoke="fc-nobid-undo"]').click();
  await sheet.locator('[data-hpd-smoke="fc-nobid"]').waitFor({ timeout: 5000 });
  assert.equal(posted[`NOBID-${omo}`]?.undone, true);
  await sheet.locator("header button").first().click();
  await openBidList(page);
  assert.match(await page.locator('[data-hpd-smoke="fc-checklist-toggle"] b').innerText(), /0 of 5 sent/, "back on the checklist");
  assert.deepEqual(errors, []);
  console.log(`PASS no bid: ${omo} marked No bid (Too far): row chip, grey pin, checklist 5 -> 4 to bid, NOBID-${omo} on the status server, no fax record; kept after reload; Undo puts it back`);
  await context.close();
} finally {
  await browser.close();
}
