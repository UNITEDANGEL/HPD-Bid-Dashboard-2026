// Your costs and the profit on a bid, at iPhone size. Stats -> Your costs starts with the owner's numbers (door
// $500, closer $30, hinges $45 a door); typing tile $4 + $6 labor per sq ft, leak $250 a job and a $25 trip makes
// the 40 sq ft tile + leak bid show: cost $675, profit at your $1,275 = $600 (47%), and at the best price.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const JOB = "AT APT 5D 5TH FLOOR KITCHEN AND BATHROOM: REMOVE AND REPLACE DEFECTIVE CERAMIC FLOOR TILES APPROX 40 SQ FT. TRACE AND REPAIR LEAK.";
const bids = fetched.bids.slice(0, 3).map((b, i) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM", ...(i === 0 ? { omo: "ER90003", description: JOB, borough: "BK" } : {}) }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  await context.addInitScript(() => { if (!localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("hpd-my-rates", JSON.stringify({ floor: 15, leak: 450, "x-floor": 25, "x-location": 100, "x-borough-BK": 50 })); } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  // Before any costs for this work: the bid asks for them.
  await list.locator("ol > li", { hasText: "ER90003" }).first().locator("button").first().click();
  assert.match(await sheet.locator('[data-hpd-smoke="fc-calc-cost"]').innerText(), /Add your costs/);
  await sheet.locator("header button").first().click();
  // Stats -> Your costs: the owner's starting numbers, then tile / leak / trip typed in.
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-stats"]').click(); await page.locator('[data-hpd-smoke="fc-stats-sub-costs"]').click();
  const row = (k) => page.locator(`[data-hpd-smoke="fc-cost-row"][data-key="${k}"]`);
  await row("door-new").waitFor({ timeout: 10000 });
  assert.equal(await row("door-new").locator('[data-hpd-smoke="fc-cost-material"]').inputValue(), "500");
  assert.equal(await row("closer").locator('[data-hpd-smoke="fc-cost-material"]').inputValue(), "30");
  assert.equal(await row("hinges").locator('[data-hpd-smoke="fc-cost-material"]').inputValue(), "45");
  const type = async (k, m, l) => { await row(k).locator('[data-hpd-smoke="fc-cost-material"]').fill(m); await row(k).locator('[data-hpd-smoke="fc-cost-labor"]').fill(l); await row(k).locator('[data-hpd-smoke="fc-cost-labor"]').blur(); };
  await type("floor", "4", "6");
  await type("leak", "50", "200");
  await type("trip", "25", "");
  // The bid: cost and profit.
  await page.locator('[data-hpd-smoke="fc-bids-tab-open"], [role="tab"]', { hasText: "Open" }).first().click();
  await list.locator("ol > li", { hasText: "ER90003" }).first().locator("button").first().click();
  const cost = sheet.locator('[data-hpd-smoke="fc-calc-cost"]');
  await cost.waitFor();
  const t = await cost.innerText();
  assert.ok(t.includes("Your cost $675") && t.includes("materials $210 + labor $440 + trip $25"), t);
  assert.match(await cost.locator('[data-hpd-smoke="fc-calc-profit"]').innerText(), /Profit at your price \$1,275: \$600 \(47%\)/);
  if (await cost.locator('[data-hpd-smoke="fc-calc-profit-best"]').count()) assert.match(await cost.locator('[data-hpd-smoke="fc-calc-profit-best"]').innerText(), /At the best price \$[\d,]+: \$[\d,-]+ \(-?\d+%\)/);
  assert.equal(await cost.locator('[data-hpd-smoke="fc-calc-cost-missing"]').count(), 0, "every line has a cost");
  // Kept after reload.
  await page.reload({ waitUntil: "load" });
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("hpd-my-costs-v1"))).floor.labor, 6);
  assert.deepEqual(errors, []);
  console.log("PASS costs: starting numbers (door $500, closer $30, hinges $45), no costs -> asks for them; tile $4+$6/sq ft, leak $50+$200, trip $25 -> cost $675 (materials $210 + labor $440 + trip $25), profit at $1,275 = $600 (47%), at the best price too; kept on the phone");
  await context.close();
} finally {
  await browser.close();
}
