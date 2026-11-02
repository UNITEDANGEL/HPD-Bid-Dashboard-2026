// Going through the bids (owner, 2 Nov: "when I go to the next bid, it zooms into the map, shows me where the bid is
// located, which borough, and then opens the work description page; it could be on the 2nd page"), at iPhone size:
// tapping a bid closes the list, the map moves to it with the borough and address on top, then the bid opens on HPD's
// job description page full screen, zoomed in on the work. ER09499's page 3 is empty: its work is on page 2 (the order
// form), so page 2 opens, scrolled down to the WORK DESCRIPTION box. The switch on the bid card turns it off.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const order = { omo: "ER09499", bidDue: tomorrow, bidDueTime: "11:00 AM", address: "47-46 40 STREET", borough: "QN", itbFile: "ER09499_103026111433.pdf", description: "APARTMENT #1H ENTRANCE DOOR RE-ALIGN DOOR REPLACE ALL HINGES", notes: "", descPages: [2], pages: 4, lat: 40.74051, lng: -73.925196 };
const other = fetched.bids.find((b) => b.itbFile && Number.isFinite(b.lat) && b.omo !== "ER09499" && (b.descPages || [3])[0] === 3);
assert.ok(other, "an invitation with its job description on page 3");
const bids = [order, { ...other, bidDue: tomorrow, bidDueTime: "11:00 AM" }];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.addInitScript(() => { try { if (!sessionStorage.getItem("walk-set")) { localStorage.setItem("hpd-bid-walk", "on"); sessionStorage.setItem("walk-set", "1"); } } catch { /* private mode */ } });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const mapScale = () => page.evaluate(() => Number((document.querySelector(".leaflet-proxy")?.style.transform.match(/scale\(([\d.]+)\)/) || [])[1] || 0));

  // Tap ER09499 in the list: the list folds away, the borough and address show over the map while it moves.
  await openBidList(page);
  const before = await mapScale();
  await page.locator('[data-hpd-smoke="fc-bid-row"]', { hasText: "ER09499" }).click();
  const arriving = page.locator('[data-hpd-smoke="fc-bid-arriving"]');
  await arriving.waitFor({ timeout: 5000 });
  assert.equal((await page.locator('[data-hpd-smoke="fc-bid-arriving-boro"]').innerText()).trim(), "📍 Queens");
  assert.match(await arriving.innerText(), /47-46 40 STREET · ER09499/);
  assert.match(await page.locator('[data-hpd-smoke="fc-bid-arriving-what"]').innerText(), /door.* · (tomorrow|\w{3}) .*11:00/i, "what the job is and when it's due");
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-list"]').getAttribute("data-size"), "peek", "the list folds so the map shows");
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-sheet"]').count(), 0, "the bid opens after the map");
  // Then the bid opens on HPD's page 2 (ER09499's work is on the order form), full screen, zoomed in on the work.
  const full = page.locator('[data-hpd-smoke="fc-itb-full"]');
  await full.waitFor({ timeout: 30000 });
  assert.equal(await arriving.count(), 0, "the borough card goes once the bid opens");
  assert.ok((await mapScale()) !== before, "the map moved to the building");
  assert.match(await full.locator(".fc-itb-bar b").innerText(), /^Page 2 of 4$/);
  const box = page.locator('[data-hpd-smoke="fc-itb-zoombox"]');
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-itb-zoombox"]')?.getAttribute("data-zoom") === "2.00", null, { timeout: 10000 });
  await page.waitForTimeout(300);
  // What shows on the screen, as parts of the page's height: the WORK DESCRIPTION lines (about 0.57-0.68 down) are in it.
  const at = await box.evaluate((el) => ({ top: el.scrollTop / el.scrollHeight, bottom: (el.scrollTop + el.clientHeight) / el.scrollHeight }));
  assert.ok(at.top > 0.15 && at.top <= 0.57 && at.bottom >= 0.68, `scrolled down to the WORK DESCRIPTION box (${at.top.toFixed(2)}-${at.bottom.toFixed(2)})`);
  await page.screenshot({ path: process.env.SHOT || "bid-walk.png" }).catch(() => {});
  await page.locator('[data-hpd-smoke="fc-itb-close"]').click();
  await page.locator('[data-hpd-smoke="fc-bid-sheet"]').waitFor();
  assert.match(await page.locator('[data-hpd-smoke="fc-bid-sheet"]').innerText(), /ER09499/);

  // "Next ▶" on the bid card goes to the other bid the same way (map first). A usual invitation: page 3, near the top.
  const next = page.locator('[data-hpd-smoke="fc-bid-next"]');
  const head = await page.locator('[data-hpd-smoke="fc-bid-sheet"] header').evaluate((el) => ({ fits: el.scrollWidth <= el.clientWidth + 1, nextRight: el.querySelector(".fc-bid-next")?.getBoundingClientRect().right || 0 }));
  assert.ok(head.fits && head.nextRight <= 390, `the bid card's top row fits the iPhone (${JSON.stringify(head)})`);
  await page.locator('[data-hpd-smoke="fc-bid-sheet"] header').screenshot({ path: process.env.SHOT || "bid-walk.png" }).catch(() => {});
  assert.equal(await next.getAttribute("aria-label"), `Next bid: ${other.omo} (1 left)`);
  await next.click();
  await page.locator('[data-hpd-smoke="fc-bid-arriving"]', { hasText: other.omo }).waitFor({ timeout: 5000 });
  await full.waitFor({ timeout: 30000 });
  assert.match(await full.locator(".fc-itb-bar b").innerText(), /^Page 3 of \d+$/);
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-itb-zoombox"]')?.getAttribute("data-zoom") === "2.00", null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const top3 = await box.evaluate((el) => el.scrollTop / el.scrollHeight);
  assert.ok(top3 < 0.25, `page 3: the job description near the top (${top3.toFixed(2)})`);
  await page.locator('[data-hpd-smoke="fc-itb-close"]').click();

  // The switch on the bid card: off, a bid opens at once on the card (no borough card, no full-screen page).
  const sw = page.locator('[data-hpd-smoke="fc-bid-walk"]');
  assert.equal(await sw.getAttribute("aria-pressed"), "true");
  await sw.click();
  assert.equal(await sw.getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-bid-walk")), "off");
  await page.locator('[data-hpd-smoke="fc-bid-to-map"]').click();
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bid-row"]', { hasText: "ER09499" }).click();
  await page.locator('[data-hpd-smoke="fc-bid-sheet"]', { hasText: "ER09499" }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-arriving"]').count(), 0);
  assert.equal(await full.count(), 0, "off: no full-screen page");
  assert.deepEqual(errors, []);
  console.log(`PASS going to a bid: list folds, "📍 Queens · 47-46 40 STREET" over the map while it moves, then HPD's page full screen at 2x on the work (ER09499: page 2, the order form, showing ${at.top.toFixed(2)}-${at.bottom.toFixed(2)} of it; Next ▶ to ${other.omo}: page 3 near the top); the switch turns it off`);
} finally {
  await browser.close();
}
