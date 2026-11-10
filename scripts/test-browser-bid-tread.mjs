// 🪜 Stair treads (bids plan item 6): a tread bid shows the per-tread price HPD awarded, "≈ $460 a marble tread
// (middle of N awards) × 3 = $1,380", above the price help. A bid without a tread count shows nothing.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const base = fetched.bids[0];
const bids = [
  { ...base, omo: "ER99901", bidDue: tomorrow, bidDueTime: "11:00 AM", itbFile: "", description: "PUBLIC HALL STAIRS 2ND TO 3RD FLOOR REPLACE CRACKED MARBLE STAIR TREADS. TOTAL TREADS = (3) ALL WORK MUST BE DONE AS PER HPD SPECIFICATIONS." },
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bid-row"]').first().click();
  const line = page.locator('[data-hpd-smoke="fc-bid-tread"]');
  await line.waitFor({ timeout: 60000 });
  const text = await line.innerText();
  assert.match(text, /^🪜 ≈ \$[\d,]+ a marble tread \(middle of \d+ awards\) × 3 = \$[\d,]+$/);
  const [rate, total] = [...text.matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  assert.equal(total, rate * 3);
  assert.deepEqual(errors, []);
  console.log(`PASS tread bid: "${text}"`);
} finally {
  await browser.close();
}
