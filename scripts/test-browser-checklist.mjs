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
  // One of today's bids due in 30 minutes (when that's still today): it must say "Send now".
  const soon = new Date(Date.now() + 30 * 60000);
  const soonTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(soon).replace(/ /g, " ");
  const urgentOmo = ny(soon) === today ? bids[0].omo : "";
  if (urgentOmo) bids[0] = { ...bids[0], bidDueTime: soonTime };
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
  if (urgentOmo) {
    const urgentRow = list.locator(`[data-hpd-smoke="fc-checklist-row"][data-omo="${urgentOmo}"]`);
    assert.match(await urgentRow.locator('[data-hpd-smoke="fc-cl-urgent"]').innerText(), /Send now/, "due in 30 min: send now");
  }
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
  // Multi-bid sitting: "Bid all 6 in a row" walks the to-do bids in order, best price filled in each time.
  await sheet.locator("header button").first().click();
  const order = await list.locator('[data-hpd-smoke="fc-checklist-row"]').evaluateAll((rs) => rs.map((r) => r.dataset.omo));
  await list.locator('[data-hpd-smoke="fc-sitting-start"]').click();
  const bar = page.locator('[data-hpd-smoke="fc-sitting-bar"]');
  for (let i = 0; i < order.length; i++) {
    await bar.waitFor({ timeout: 10000 });
    assert.match(await bar.innerText(), new RegExp(`Bid ${i + 1} of ${order.length}`));
    assert.equal((await sheet.locator("header strong").innerText()).trim(), order[i], `sitting step ${i + 1} is ${order[i]}`);
    const filled = Number(await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue());
    assert.ok(filled > 0, `best price filled in for ${order[i]}`);
    await page.locator('[data-hpd-smoke="fc-sitting-skip"]').click();
  }
  const summary = page.locator('[data-hpd-smoke="fc-sitting-summary"]');
  await summary.waitFor({ timeout: 5000 });
  assert.match(await summary.innerText(), new RegExp(`0 sent, ${order.length} skipped`));
  await summary.locator("button").click();
  // Stop in the middle brings the checklist back.
  await list.locator('[data-hpd-smoke="fc-sitting-start"]').click();
  await bar.waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-sitting-stop"]').click();
  assert.equal(await bar.count(), 0);
  await sheet.locator("header button").first().click();
  await rows.first().waitFor({ timeout: 5000 });
  // Close the checklist: stays closed for today.
  await list.locator('[data-hpd-smoke="fc-checklist-toggle"]').click();
  assert.equal(await rows.count(), 0);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await page.locator('[data-hpd-smoke="fc-checklist"]').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-checklist-row"]').count(), 0, "closed stays closed today");
  assert.deepEqual(errors, []);
  console.log(`PASS bid checklist: 6 due today/tomorrow, 0 of 6 sent, 'Bid $${price.toLocaleString()}' opened ${omo} with that price, 6-bid sitting in order with best prices, skip to the summary, stop; closed stays closed`);
} finally {
  await browser.close();
}
