// 💵 Cost and profit for each kind of work (plan, Next level item D, 12 Nov): Bids → Stats → Wins & prices → tap a
// kind of work: its price history shows your cost for a job like it (your costs list, on this phone) and the profit
// at your usual winning price and at other winners' typical price. Costs are seeded; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const money = (t) => Number(t.replace(/[$,]/g, ""));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  // A new door costs $500 materials + $200 labor; no trip cost.
  await c.addInitScript(() => localStorage.setItem("hpd-my-costs-v1", JSON.stringify({ "door-new": { material: 500, labor: 200 } })));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-stats"]').click();
  await page.locator('[data-hpd-smoke="fc-stats-sub-prices"]').click();
  await page.locator('[data-hpd-smoke="fc-stats-prices"]').waitFor({ timeout: 30000 });
  // The plain "new door" row (one new door, nothing else).
  const rows = page.locator('[data-hpd-smoke="fc-price-row"]');
  const labels = await rows.locator("th").allInnerTexts();
  const i = labels.findIndex((l) => /^new door\b(?! *\+)/i.test(l.trim()));
  assert.ok(i >= 0, `a new-door row in the price list: ${labels.slice(0, 15).join(" | ")}`);
  const row = rows.nth(i);
  const yours = money((await row.locator("td").first().innerText()).match(/\$[\d,]+/)[0]);
  const others = money((await row.locator("td").nth(1).innerText()).match(/\$[\d,]+/)[0]);
  await row.click();
  const line = page.locator('[data-hpd-smoke="fc-work-profit"]');
  await line.waitFor({ timeout: 10000 });
  const text = await line.innerText();
  assert.match(text, /^💵 Your cost for a job like this ≈ \$700/, text);
  assert.ok(text.includes(`profit at your usual $${yours.toLocaleString("en-US")}: $${(yours - 700).toLocaleString("en-US")} (${Math.round(((yours - 700) / yours) * 100)}%)`), `profit at your usual: ${text}`);
  assert.ok(text.includes(`at other winners' $${others.toLocaleString("en-US")}: $${(others - 700).toLocaleString("en-US")}`), `profit at others: ${text}`);
  if (process.env.SHOT) { await line.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT}/work-profit.png` }); }
  assert.deepEqual(errors, []);
  console.log(`PASS work profit: "${text}"`);
} finally {
  await browser.close();
}
