// Your rates at iPhone size (sideways): the bid shows "The job" (vinyl floor · 120 sq ft · Apt C3 ...), you set
// $12 per sq ft on the floor line -> My price $1,440, Use puts it in the price box; a Secure Tech lock at $2,000
// each + electric strike at $350 each -> $2,350; the list row shows the job line and My price; Stats lists the
// rates and Remove clears one. Saves no bid.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const FLOOR = "RESTORE DEFECTIVE FLOORING AT APT C3 AT APT C3 PRIVATE HALLWAY: PROPERLY REMOVE THE DEFECTIVE VINYL FLOORING, APPROXIMATELY 120 SQ FT.. REPLACE WITH VINYL FLOORINGG APPROXIMATELY 120 SQ.FT. SEAL ALL EDGES AND CORNERS.";
const LOCK = "PUBLIC PARTS SUPPLY AND INSTALL SECURE TECH LOCK TO REPLACE DEFECTIVE LOCK AT BUILDING ENTRANCE DOOR PUBLIC HALL 1ST STORY, KEEP CYLINDER THE SAME. INSTALL NEW ELECTRIC STRIKE PLATE AND PROGRAM.";
const bids = fetched.bids.slice(0, 4).map((b, i) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM", ...(i === 0 ? { omo: "ER90001", description: FLOOR } : i === 1 ? { omo: "ER90002", description: LOCK } : {}) }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  const row = (omo) => list.locator("ol > li", { hasText: omo }).first();
  await row("ER90001").waitFor({ timeout: 30000 });
  assert.match(await row("ER90001").locator('[data-hpd-smoke="fc-bid-sum"]').innerText(), /Vinyl floor · 120 sq ft/);
  // Floor job: The job + set $12 / sq ft.
  await row("ER90001").locator("button").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  const sum = sheet.locator('[data-hpd-smoke="fc-job-sum"]');
  await sum.waitFor({ timeout: 10000 });
  assert.match(await sum.innerText(), /Vinyl floor · 120 sq ft/);
  assert.match(await sum.locator('[data-hpd-smoke="fc-job-where"]').innerText(), /Apt C3 · private hallway/);
  const my = sheet.locator('[data-hpd-smoke="fc-my-price"]');
  await my.locator('[data-hpd-smoke="fc-rate-edit"]').first().click();
  await my.locator('[data-hpd-smoke="fc-rate-input"]').fill("12");
  await my.locator('[data-hpd-smoke="fc-rate-save"]').click();
  assert.match(await my.locator('[data-hpd-smoke="fc-my-row"]').first().innerText(), /\$12 per sq ft = \$1,440/);
  assert.match(await my.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$1,440/);
  await my.locator('[data-hpd-smoke="fc-my-use"]').click();
  assert.equal((await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue()).replace(/[^0-9]/g, ""), "1440", "Use puts My price in");
  await sheet.locator("header button").first().click();
  // Lock job: Secure Tech $2,000 each + electric strike $350 each.
  await row("ER90002").locator("button").first().click();
  await sum.waitFor();
  assert.match(await sum.innerText(), /Secure Tech lock · ×1/);
  assert.match(await sum.innerText(), /Electric strike · ×1/);
  for (const [key, rate] of [["secure-tech", "2000"], ["electric-strike", "350"]]) {
    const r = my.locator(`[data-hpd-smoke="fc-my-row"][data-key="${key}"]`);
    await r.locator('[data-hpd-smoke="fc-rate-edit"]').click();
    await r.locator('[data-hpd-smoke="fc-rate-input"]').fill(rate);
    await r.locator('[data-hpd-smoke="fc-rate-save"]').click();
  }
  assert.match(await my.locator('[data-hpd-smoke="fc-my-total"]').innerText(), /My price: \$2,350/);
  await sheet.locator("header button").first().click();
  // The list rows show My price; the floor rate applies to every floor job.
  assert.match(await row("ER90001").innerText(), /My price \$1,440/);
  assert.match(await row("ER90002").innerText(), /My price \$2,350/);
  // Kept after reload; Stats lists the rates; Remove clears one.
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load" });
  await openBidList(page);
  await row("ER90002").waitFor({ timeout: 30000 });
  assert.match(await row("ER90002").innerText(), /My price \$2,350/);
  await page.locator('[data-hpd-smoke="fc-bids-stats"]').click(); await page.locator('[data-hpd-smoke="fc-stats-sub-costs"]').click();
  const rl = page.locator('[data-hpd-smoke="fc-rates-list"]');
  await rl.waitFor({ timeout: 10000 });
  const t = await rl.innerText();
  assert.ok(/\$12 per sq ft/.test(t) && /\$2,000 each/.test(t) && /\$350 each/.test(t), `rates listed: ${t}`);
  await rl.locator("li", { hasText: "electric strike" }).locator("button").click();
  assert.equal(await rl.locator("li").count(), 2);
  assert.deepEqual(errors, []);
  console.log("PASS my price: The job shows Vinyl floor · 120 sq ft at Apt C3 · private hallway; $12/sq ft -> $1,440 and Use fills it; Secure Tech $2,000 + electric strike $350 -> $2,350; list rows show My price, kept after reload; Stats lists the rates and Remove clears one");
  await context.close();
} finally {
  await browser.close();
}
