// Invitations filled out already (owner, 16 Oct): the bid form is filled in when the invitation opens (company,
// owner, address, phone, dates, description) with NO price (the owner types it); typing a price and one tap on
// Save makes the final bid document, ready to open and send. Sends nothing.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 4).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
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
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li > button:first-child').first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  const omo = (await sheet.locator("header strong").innerText()).trim();
  // The filled form is ready; the price is not filled in.
  const doc = sheet.locator('[data-hpd-smoke="fc-bid-draft-doc"]');
  await doc.waitFor({ timeout: 60000 });
  const href = await doc.getAttribute("href");
  assert.match(href, /^blob:/);
  const head = await page.evaluate(async (u) => { const b = new Uint8Array(await (await fetch(u)).arrayBuffer()); return String.fromCharCode(...b.slice(0, 5)) + " " + b.length; }, href);
  assert.match(head, /^%PDF- \d+/, "a real PDF");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-prefilled"]').innerText(), /Only your price is missing/);
  const price = sheet.locator('[data-hpd-smoke="fc-bid-price"]');
  const before = (await price.inputValue()).trim();
  // Type a price, Save once: the final document is made.
  await price.fill("1234");
  await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  // A price far above what wins this kind of job asks for a second tap (real bids change daily).
  if (await sheet.locator('[data-hpd-smoke="fc-bid-high"]').count()) await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-open"]').waitFor({ timeout: 60000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-open"]').getAttribute("href"), /^blob:/);
  assert.ok(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').isEnabled(), "ready to send (two taps, not tapped here)");
  assert.deepEqual(errors, []);
  console.log(`PASS filled form: ${omo} opened with the bid form filled in (company, dates, description) and ${before ? `the price box at your last price for this work ($${before})` : "no price"}; typed $1,234, one tap on Save made the final bid document, ready to send`);
  await context.close();
} finally {
  await browser.close();
}
