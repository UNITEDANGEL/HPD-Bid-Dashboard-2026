// HPD's pages from the bid list (iPhone sideways and upright): the next bids due get their job-description
// page drawn ahead and shown as a small picture on the row; tapping it opens HPD's pages full screen without
// opening the bid; the second time they come from the phone (no PDF download, fast); "Price it" opens the bid.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 10).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
assert.ok(bids.length >= 2, "invitations with HPD's PDF");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
try {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const where = `${w}x${h}`;
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
    await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const pdfLoads = [];
    page.on("request", (r) => { if (/\/api\/private\/itb\//.test(r.url())) pdfLoads.push(r.url()); });
    await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
    // Drawn ahead: page pictures appear on the rows without opening anything.
    await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-bid-thumb"]').length >= 2, null, { timeout: 90000 });
    const thumbs = await page.locator('[data-hpd-smoke="fc-bid-thumb"]').count();
    // The row's own button still opens the bid; the Pages button is beside it, on screen.
    const btn = page.locator('[data-hpd-smoke="fc-bid-pages-btn"]').first();
    const box = await btn.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44 && box.x + box.width <= w, `${where}: Pages button big enough and on screen`);
    // Open: from the phone, no new PDF download.
    await page.waitForTimeout(2500);
    const before = pdfLoads.length;
    const t0 = Date.now();
    await btn.click();
    const sheet = page.locator('[data-hpd-smoke="fc-bid-pages-sheet"]');
    await sheet.locator('[data-hpd-smoke="fc-itb-thumb"] img').first().waitFor({ timeout: 10000 });
    await page.waitForFunction(() => { const i = document.querySelector('[data-hpd-smoke="fc-bid-pages-sheet"] [data-hpd-smoke="fc-itb-thumb"] img'); return i && i.naturalWidth > 300; }, null, { timeout: 10000 });
    const ms = Date.now() - t0;
    assert.equal(pdfLoads.length, before, `${where}: pages came from the phone, no PDF download`);
    assert.ok(ms < 3000, `${where}: pages shown in ${ms} ms`);
    const sb = await sheet.boundingBox();
    assert.ok(sb.width >= w - 1 && sb.height >= h - 1, `${where}: full screen`);
    // A page opens full screen above it.
    await sheet.locator('[data-hpd-smoke="fc-itb-thumb"]').first().click();
    await page.locator('[data-hpd-smoke="fc-itb-full"]').waitFor({ timeout: 5000 });
    await page.locator('[data-hpd-smoke="fc-itb-close"]').click();
    // ← Bids goes back; Price it opens the bid.
    await page.locator('[data-hpd-smoke="fc-bid-pages-close"]').click();
    assert.equal(await sheet.count(), 0);
    await page.locator('[data-hpd-smoke="fc-bid-pages-btn"]').first().click();
    await page.locator('[data-hpd-smoke="fc-bid-pages-open"]').click();
    await page.locator('[data-hpd-smoke="fc-bid-sheet"]').first().waitFor({ timeout: 10000 });
    assert.deepEqual(errors, []);
    results.push(`${where}: ${thumbs} rows with page pictures, opened in ${ms} ms from the phone`);
    await context.close();
  }
  console.log(`PASS bid pages: ${results.join("; ")}; full screen page, ← Bids back, Price it opens the bid`);
} finally {
  await browser.close();
}
