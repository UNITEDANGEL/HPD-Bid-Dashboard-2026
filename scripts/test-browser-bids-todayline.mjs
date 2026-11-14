// "Today: bids sent and money in sight" (owner, 14 Nov): one line above the bids tabs: how many bids went out today and their total.
// Two bids sent today ($900 + $1,000) and one three days ago ($5,000, not counted). Test data; nothing is faxed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const src = fetched.bids.filter((b) => b.itbFile).slice(0, 3);
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const mk = (b, price, days) => ({ omo: b.omo, address: b.address || "", borough: b.borough, bidDue: b.bidDue || "2026-11-20", bidDueTime: "11:00 AM", price, savedAt: ago(days), updatedAt: ago(days), sentAt: ago(days), sentPrice: price, status: "sent", work: "test" });
const records = Object.fromEntries([mk(src[0], 900, 0), mk(src[1], 1000, 0), mk(src[2], 5000, 3)].map((r) => [r.omo, r]));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  await c.addInitScript((recs) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-bid-records-v1", JSON.stringify(recs)); sessionStorage.setItem("seeded", "1"); } }, records);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  const line = page.locator('[data-hpd-smoke="fc-bids-todayline"]');
  await page.getByText(/invitations/).first().click();
  await line.waitFor({ timeout: 90000 });
  const text = (await line.innerText()).trim();
  assert.match(text, /2 bids sent/, text);
  assert.match(text, /\$1,900/, text);
  assert.deepEqual(errors, []);
  console.log(`PASS bids today line: "${text}"`);
} finally {
  await browser.close();
}
