// Invitations filled out already (owner, 16 Oct): one with no price opens at a price (here the best price, or
// My price when every line has a rate), with a note saying where it came from; one tap on Save makes the bid
// document right away (no Fill tap): the package is ready to open and send. Sends nothing.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 6).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  // The first invitation that gets a price filled in (one with enough past awards for a best price).
  let picked = "";
  for (let i = 0; i < bids.length && !picked; i++) {
    await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li > button:first-child').nth(i).click();
    await sheet.waitFor();
    try { await sheet.locator('[data-hpd-smoke="fc-bid-prefilled"]').waitFor({ timeout: 6000 }); picked = (await sheet.locator("header strong").innerText()).trim(); }
    catch { await sheet.locator("header button").first().click(); await openBidList(page); }
  }
  assert.ok(picked, "an invitation opened with its price filled in");
  const price = (await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue()).replace(/[^0-9]/g, "");
  assert.ok(Number(price) > 0, "price box filled");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-prefilled"]').innerText(), /Filled in: (My price from your rates|the best price \(wins ~\d+%\)|your minimum)/);
  if (/best price/.test(await sheet.locator('[data-hpd-smoke="fc-bid-prefilled"]').innerText())) assert.equal(price, (await sheet.locator('[data-hpd-smoke="fc-bid-best"] b').first().innerText()).replace(/[^0-9]/g, ""), "the best price shown below");
  // One tap: saved and the document made.
  await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-open"]').waitFor({ timeout: 60000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-open"]').getAttribute("href"), /^blob:/, "the filled bid document opens");
  assert.ok(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').isEnabled(), "ready to send (two taps, not tapped here)");
  assert.deepEqual(errors, []);
  console.log(`PASS prefill: ${picked} opened at $${price} (filled in, with where it came from); one tap on Save made the bid document, ready to open and send`);
  await context.close();
} finally {
  await browser.close();
}
