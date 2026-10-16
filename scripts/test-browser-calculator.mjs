// Bid calculator + version on screen at iPhone size.
// 1. A 5th-floor tile + leak job in Brooklyn: rates per line ($15/sq ft tile, $450 leak), floors up ($25 per floor
//    above the 2nd), extra location ($100), Brooklyn travel ($50) -> total; the leak changed to $700 for this job
//    only; +10%; the verdict against the market's best price; Use puts it in the price box.
// 2. The version at the bottom opens What's new (the list of changes) and Ask for a change saves a request.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const JOB = "AT APT 5D 5TH FLOOR KITCHEN AND BATHROOM: REMOVE AND REPLACE DEFECTIVE CERAMIC FLOOR TILES APPROX 40 SQ FT. TRACE AND REPAIR LEAK.";
const bids = fetched.bids.slice(0, 3).map((b, i) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM", ...(i === 0 ? { omo: "ER90003", description: JOB, borough: "BK" } : {}) }));
const posted = {};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, async (r) => {
    if (r.request().method() === "POST" && /\/override$/.test(r.request().url())) { const b = r.request().postDataJSON(); posted[b.key] = b.patch; return r.fulfill({ json: { ok: true } }); }
    // One earlier request with a progress report (the owner reads it in What's new).
    return r.fulfill({ json: { ok: true, overrides: { "CHANGE-REQUEST-20261016193210": { at: "2026-10-16T19:32:10.006Z", text: "Look at the email from HPD" }, "CHANGE-REPLY-20261016193210": { status: "Working on it", workingAt: new Date().toISOString(), steps: [{ text: "Read her emails", done: true }, { text: "Check each OMO", done: true }, { text: "Prepare the paperwork", done: false }, { text: "Send", done: false }], updates: [{ at: new Date().toISOString(), text: "Checked the 14 OMOs on her list" }] } }, accepted: [] } });
  });
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  await context.addInitScript(() => { if (!localStorage.getItem("seeded-rates")) { localStorage.setItem("seeded-rates", "1"); localStorage.setItem("hpd-my-rates", JSON.stringify({ floor: 15, leak: 450 })); } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li', { hasText: "ER90003" }).first().locator("button").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  const calc = sheet.locator('[data-hpd-smoke="fc-my-price"]');
  await calc.waitFor({ timeout: 10000 });
  const row = (k) => calc.locator(`[data-hpd-smoke="fc-my-row"][data-key="${k}"]`);
  assert.match(await row("floor").innerText(), /\$15 per sq ft = \$600/);
  assert.match(await row("x-floor").innerText(), /5th floor: 3 above the 2nd/);
  assert.match(await row("x-location").innerText(), /2 in this job/);
  assert.match(await row("x-borough-BK").innerText(), /Brooklyn/);
  assert.match(await calc.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$1,050/, "extras without a rate add nothing");
  for (const [k, v] of [["x-floor", "25"], ["x-location", "100"], ["x-borough-BK", "50"]]) {
    await row(k).locator('[data-hpd-smoke="fc-rate-edit"]').click();
    await row(k).locator('[data-hpd-smoke="fc-rate-input"]').fill(v);
    await row(k).locator('[data-hpd-smoke="fc-rate-save"]').click();
  }
  assert.match(await calc.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$1,275/, "600 + 450 + 75 + 100 + 50");
  // The leak is harder on this job: $700 for this job only.
  await row("leak").locator('[data-hpd-smoke="fc-calc-override"]').click();
  await row("leak").locator('[data-hpd-smoke="fc-calc-override-input"]').fill("700");
  await row("leak").locator('[data-hpd-smoke="fc-calc-override-save"]').click();
  assert.match(await row("leak").innerText(), /\$700 ✎ this job/);
  assert.match(await calc.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$1,525/);
  await calc.locator('[data-hpd-smoke="fc-calc-adjust-10"]').click();
  assert.match(await calc.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$1,678 \(\$1,525 \+10%\)/);
  if (await calc.locator('[data-hpd-smoke="fc-calc-verdict"]').count()) assert.match(await calc.locator('[data-hpd-smoke="fc-calc-verdict"]').innerText(), /market's best price \(\$[\d,]+, wins ~\d+%\)/);
  await calc.locator('[data-hpd-smoke="fc-my-use"]').click();
  assert.equal((await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue()).replace(/[^0-9]/g, ""), "1678");
  // The rate for floors is kept for the next job; the $700 change was for this job only.
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("hpd-my-rates")))["x-floor"], 25);
  await sheet.locator("header button").first().click();
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li', { hasText: "ER90003" }).first().locator("button").first().click();
  assert.match(await calc.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$1,275/, "back to the rates when reopened");
  await sheet.locator("header button").first().click();
  // Version at the bottom -> What's new; Ask for a change.
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load" });
  const tag = page.locator('[data-hpd-smoke="fc-version-tag"]');
  await tag.waitFor({ timeout: 20000 });
  assert.match(await tag.innerText(), /what's new/);
  await page.waitForFunction(() => /1 new update/.test(document.querySelector('[data-hpd-smoke="fc-version-tag"]')?.textContent || ""), null, { timeout: 15000 }); // the replies load after the map
  await tag.click();
  const wn = page.locator('[data-hpd-smoke="fc-whatsnew"]');
  await wn.waitFor({ timeout: 5000 });
  await wn.locator('[data-hpd-smoke="fc-whatsnew-day"]').first().waitFor({ timeout: 10000 });
  assert.ok((await wn.locator('[data-hpd-smoke="fc-whatsnew-day"]').allInnerTexts()).some((t) => t.includes("Bid calculator")), "the change list includes the calculator");
  const th = wn.locator('[data-hpd-smoke="fc-change-thread"]').first();
  await th.waitFor({ timeout: 5000 });
  { const t = await th.innerText(); assert.ok(t.includes("Look at the email from HPD") && t.includes("Working on it") && t.includes("Checked the 14 OMOs"), t); }
  assert.equal(await th.locator('[data-hpd-smoke="fc-change-count"]').innerText(), "2 of 4 steps · 50%");
  assert.ok((await th.locator('[data-hpd-smoke="fc-change-working"]').innerText()).includes("Claude is working on this right now"));
  await wn.locator('[data-hpd-smoke="fc-ask-change-text"]').fill("Add 15 days to the day filter");
  await wn.locator('[data-hpd-smoke="fc-ask-change-save"]').click();
  await wn.locator('[data-hpd-smoke="fc-ask-change-status"]').waitFor({ timeout: 5000 });
  const req = Object.entries(posted).find(([k]) => k.startsWith("CHANGE-REQUEST-"));
  assert.equal(req?.[1]?.text, "Add 15 days to the day filter");
  assert.deepEqual(errors, []);
  console.log("PASS calculator: tile 40 sq ft x $15 + leak $450, 5th floor (3 up x $25), 2nd location $100, Brooklyn $50 = $1,275; leak $700 this job only -> $1,525; +10% -> $1,678 and Use fills it; rates kept, this-job change not; version at the bottom opens What's new; Ask for a change saved to the status server");
  await context.close();
} finally {
  await browser.close();
}
