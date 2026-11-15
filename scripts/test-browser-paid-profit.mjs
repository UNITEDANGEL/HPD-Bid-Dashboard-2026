// 💵 Profit after HPD paid (plan, Next level item C, 15 Nov): Bids → Stats → Costs & rates shows, for your jobs HPD paid
// (PIP), the paid amount minus your costs for that job, total and lowest first. A job with work you have no cost for
// is not counted (and the kind of work to add is named); a paid job the app doesn't know the work of is left out.
// HPD's payments and the awards are stand-ins; costs are seeded; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const money = (t) => Number(String(t).replace(/[$,]/g, ""));
const door = "INSTALL NEW HOLLOW METAL DOOR AND FRAME AT APARTMENT ENTRANCE. TOTAL DOORS= 1";
const job = (omo, description, amount) => ({ omo, amount, awardDate: "2026-09-01", won: true, boro: "Brooklyn", zip: "11213", area: "", address: `${omo.slice(-3)} TEST AVENUE`, description });
const awards = { generatedAt: "2026-11-15T00:00:00Z", source: "test", jobs: [
  job("TT00001", door, 1200),
  job("TT00002", door, 600),
  job("TT00003", "PAINT THE PUBLIC HALLWAY WALLS AND CEILING ON THE 2ND STORY. TOTAL SQ FT= 400", 900),
] };
const paid = { generatedAt: "2026-11-10T12:00:00Z", source: "test", jobs: {
  TT00001: { status: "paid", paid: 1200, outstanding: 0, closed: true, closedDate: "2026-10-01", lastDate: "2026-09-25" },
  TT00002: { status: "paid", paid: 600, outstanding: 0, closed: true, closedDate: "2026-10-05", lastDate: "2026-09-30" },
  TT00003: { status: "paid", paid: 900, outstanding: 0, closed: true, closedDate: "2026-10-07", lastDate: "2026-10-01" },
  TT99999: { status: "paid", paid: 5000, outstanding: 0, closed: true, closedDate: "2026-10-09", lastDate: "2026-10-01" },
  TT00004: { status: "not paid yet", paid: 0, outstanding: 100, closed: false, closedDate: "", lastDate: "2026-10-09" },
} };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  await c.route(/\/data\/market_awards\.json/, (r) => r.fulfill({ json: awards }));
  await c.route(/\/data\/pip_paid\.json/, (r) => r.fulfill({ json: paid }));
  // A new door costs $500 materials + $200 labor; nothing for painting; no trip cost.
  await c.addInitScript(() => localStorage.setItem("hpd-my-costs-v1", JSON.stringify({ "door-new": { material: 500, labor: 200 } })));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-stats"]').click();
  await page.locator('[data-hpd-smoke="fc-stats-sub-costs"]').click();
  const box = page.locator('[data-hpd-smoke="fc-paid-profit"]');
  await box.waitFor({ timeout: 30000 });
  // Your costs load a moment after the screen opens (before that, nothing is costed).
  await page.waitForFunction(() => /paid jobs:/.test(document.querySelector('[data-hpd-smoke="fc-paid-profit-sum"]')?.textContent || ""), null, { timeout: 30000 });
  const sum = await box.locator('[data-hpd-smoke="fc-paid-profit-sum"]').innerText();
  // 2 door jobs: paid $1,800, cost $1,400, profit $400 (22%).
  assert.match(sum, /^2 paid jobs: HPD paid \$1,800, your costs \$1,400 → profit \$400 \(22%\)\.$/, sum);
  const rows = await box.locator('[data-hpd-smoke="fc-paid-profit-row"]').allInnerTexts();
  assert.equal(rows.length, 2, rows.join(" | "));
  assert.match(rows[0], /TT00002[\s\S]*paid \$600 − cost \$700 = −\$100 \(-17%\)/, "lowest (a loss) first");
  assert.ok(await box.locator(".is-loss").count() >= 1, "the loss is marked");
  assert.match(rows[1], /TT00001[\s\S]*paid \$1,200 − cost \$700 = \$500 \(42%\)/);
  const miss = await box.locator('[data-hpd-smoke="fc-paid-profit-missing"]').innerText();
  assert.match(miss, /^1 other paid job not counted: add a cost above for Painting \(1\)\.$/, miss);
  assert.doesNotMatch(await box.innerText(), /TT99999|TT00004/, "unknown and unpaid jobs left out");
  assert.match(await box.innerText(), /HPD payments as of Nov 10, 2026/);
  if (process.env.SHOT) { await box.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT}/paid-profit.png` }); }
  assert.deepEqual(errors, []);
  console.log(`PASS paid profit: "${sum}" · ${rows.length} rows, lowest first · "${miss}"`);
} finally {
  await browser.close();
}
