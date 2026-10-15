// Browser test at iPhone size: the morning bid checklist lists every invitation due today and tomorrow with
// its state and best price; "Bid $X" opens that bid with the best price filled in; it remembers closed.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const ny = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const today = ny(new Date()), tomorrow = ny(new Date(Date.now() + 86400000)), later = ny(new Date(Date.now() + 4 * 86400000));
  // Real invitations: three due today (late in the day so they're still open), three tomorrow, the rest later.
  const bids = fetched.bids.map((b, i) => ({ ...b, bidDue: i < 3 ? today : i < 6 ? tomorrow : later, bidDueTime: "11:59 PM" }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  const list = page.locator('[data-hpd-smoke="fc-checklist"]');
  await list.waitFor({ timeout: 20000 });
  const rows = list.locator('[data-hpd-smoke="fc-checklist-row"]');
  await rows.first().waitFor({ timeout: 10000 });
  assert.equal(await rows.count(), 6, "today + tomorrow only");
  assert.match(await list.locator('[data-hpd-smoke="fc-checklist-toggle"]').innerText(), /0 of 6 sent/);
  assert.match(await list.locator('[data-hpd-smoke="fc-checklist-toggle"]').innerText(), /3 due today, 3 tomorrow still to bid/);
  // Wait for prices (market history) and tap the first "Bid $X".
  const bidBtn = list.locator('[data-hpd-smoke="fc-checklist-bid"]', { hasText: /Bid \$/ }).first();
  await bidBtn.waitFor({ timeout: 30000 });
  const price = Number((await bidBtn.innerText()).match(/\$([\d,]+)/)[1].replace(/,/g, ""));
  const omo = await bidBtn.evaluate((b) => b.closest("[data-omo]").dataset.omo);
  await bidBtn.click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor({ timeout: 10000 });
  assert.equal((await sheet.locator("header strong").innerText()).trim(), omo);
  assert.equal(Number(await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue()), price, "best price filled in");
  // Back to the list, close the checklist: stays closed for today.
  await sheet.locator("header button").first().click();
  await list.locator('[data-hpd-smoke="fc-checklist-toggle"]').click();
  assert.equal(await rows.count(), 0);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await page.locator('[data-hpd-smoke="fc-checklist"]').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-checklist-row"]').count(), 0, "closed stays closed today");
  assert.deepEqual(errors, []);
  console.log(`PASS bid checklist: 6 due today/tomorrow, 0 of 6 sent, 'Bid $${price.toLocaleString()}' opened ${omo} with that price, closed stays closed`);
} finally {
  await browser.close();
}
