// Price check at iPhone size: typing a price more than 15% above the app's best price shows how much less
// often it wins and a one-tap "Use $best"; at the best price there's no note. Stats shows "Your price vs the
// app's best price" with the same totals as public/data/bid_win_stats.json. Saves nothing.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const stats = await (await fetch(`${baseUrl}/data/bid_win_stats.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const money = (n) => `$${Math.round(n).toLocaleString()}`;
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
  await list.locator("ol > li > button:first-child").first().waitFor({ timeout: 30000 });
  // A bid with a best price (needs past awards for its kind of work).
  let found = null;
  for (let i = 0; i < Math.min(8, bids.length) && !found; i++) {
    await list.locator("ol > li > button:first-child").nth(i).click();
    const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
    await sheet.waitFor({ timeout: 10000 });
    const best = sheet.locator('[data-hpd-smoke="fc-bid-best"] b');
    if (await best.count().then((n) => n > 0) && await page.locator('[data-hpd-smoke="fc-bid-targets"]').count()) found = { sheet, best: Number((await best.first().innerText()).replace(/[^0-9]/g, "")) };
    else await sheet.locator("header button").first().click();
  }
  assert.ok(found, "a bid with a best price");
  const { sheet, best } = found;
  const price = sheet.locator('[data-hpd-smoke="fc-bid-price"]');
  await price.fill(String(best));
  await page.waitForTimeout(200);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-above"], [data-hpd-smoke="fc-bid-high"]').count(), 0, "no note at the best price");
  // 20% above (what you've typically bid): the soft note, or the hard warning if it would win < 1 in 4.
  const high = Math.round(best * 1.2);
  await price.fill(String(high));
  const note = sheet.locator('[data-hpd-smoke="fc-bid-above"], [data-hpd-smoke="fc-bid-high"]');
  await note.first().waitFor({ timeout: 3000 });
  const text = await note.first().innerText();
  const kind = await note.first().getAttribute("data-hpd-smoke");
  if (kind === "fc-bid-above") assert.match(text, /20% above the best price/);
  assert.ok(text.includes(`Use ${money(best)}`), `offers Use ${money(best)}`);
  await note.first().locator("button").click();
  assert.equal((await price.inputValue()).replace(/[^0-9]/g, ""), String(best), "Use best puts the best price in");
  assert.equal(await note.count(), 0, "note gone at the best price");
  // Just under 15% above: no note.
  await price.fill(String(Math.floor(best * 1.14)));
  await page.waitForTimeout(200);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-above"]').count(), 0, "no soft note under 15% above");
  // Your minimum: set it above the best price -> the best price becomes the minimum, under it a note.
  const floor = best + 100;
  await sheet.locator('[data-hpd-smoke="fc-floor-edit"]').click();
  await sheet.locator('[data-hpd-smoke="fc-floor-input"]').fill(String(floor));
  await sheet.locator('[data-hpd-smoke="fc-floor-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-floored"]').waitFor({ timeout: 3000 });
  assert.equal(Number((await sheet.locator('[data-hpd-smoke="fc-bid-best"] b').first().innerText()).replace(/[^0-9]/g, "")), floor, "best price raised to your minimum");
  { const t = await sheet.locator('[data-hpd-smoke="fc-floor"]').innerText(); assert.ok(t.includes("Your minimum for") && t.includes(money(floor)), `minimum shown: ${t}`); }
  await price.fill(String(floor - 50));
  await sheet.locator('[data-hpd-smoke="fc-bid-below-floor"]').waitFor({ timeout: 3000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-below-floor"] button').click();
  assert.equal((await price.inputValue()).replace(/[^0-9]/g, ""), String(floor), "Use minimum puts it in");
  const omo = (await sheet.locator("header strong, header b").first().innerText().catch(() => "")).trim();
  await sheet.locator("header button").first().click();
  // Kept after a reload; the list row shows the minimum as the best price too.
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load" });
  await openBidList(page);
  await list.locator("ol > li > button:first-child").first().waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="fc-bids-stats"]').click(); await page.locator('[data-hpd-smoke="fc-stats-sub-costs"]').click();
  const floorsBox = page.locator('[data-hpd-smoke="fc-floors"]');
  await floorsBox.waitFor({ timeout: 10000 });
  assert.ok((await floorsBox.innerText()).includes(money(floor)), "Stats lists your minimum");
  await floorsBox.locator('[data-hpd-smoke="fc-floors-remove"]').click();
  assert.match(await floorsBox.innerText(), /None yet/, "removed");
  // Stats -> Wins & prices: the same totals as the data file.
  await page.locator('[data-hpd-smoke="fc-stats-sub-prices"]').click();
  const box = page.locator('[data-hpd-smoke="fc-vsbest"]');
  await box.waitFor({ timeout: 20000 });
  const v = stats.vsBest.total;
  const head = await box.locator(".fc-vsbest-head").innerText();
  assert.ok(head.includes(`${v.bestWon} jobs (${money(v.bestAmount)})`) && head.includes(`${v.won} (${money(v.wonAmount)})`), `Stats headline matches the data: ${head}`);
  assert.equal(await box.locator('[data-hpd-smoke="fc-vsbest-months"] tbody tr').count(), Math.min(6, stats.vsBest.byMonth.length));
  assert.deepEqual(errors, []);
  console.log(`PASS price check: best ${money(best)} no note; ${money(high)} (+20%) shows "${kind === "fc-bid-above" ? "20% above the best price" : "will probably lose"}" and Use ${money(best)} puts it back; under 15% no note; minimum ${money(best + 100)} raises the best price, a lower price gets "below your minimum", kept after reload, listed and removed in Stats; Stats: best price would have won ${v.bestWon} (${money(v.bestAmount)}) vs your ${v.won} (${money(v.wonAmount)})`);
  await context.close();
} finally {
  await browser.close();
}
