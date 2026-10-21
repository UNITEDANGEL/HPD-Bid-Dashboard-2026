// Zoom only the job pages (owner, 20 Oct: "the whole app zooms in, I just want to zoom in the job pages"): the app is
// locked at 1x (viewport + no pinch outside the pages), a two-finger pinch on HPD's page in full screen zooms that page,
// double-tap zooms in / back out, and the map still pinch-zooms (Leaflet). Real touch events (CDP), iPhone size.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 6).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  // Two fingers from `gap` apart to `gap2` apart around (cx, cy).
  const pinchAt = async (cx, cy, gap, gap2) => {
    await touch("touchStart", [[cx - gap / 2, cy], [cx + gap / 2, cy]]);
    for (let i = 1; i <= 8; i++) { const g = gap + ((gap2 - gap) * i) / 8; await touch("touchMove", [[cx - g / 2, cy], [cx + g / 2, cy]]); await page.waitForTimeout(16); }
    await touch("touchEnd", []);
    await page.waitForTimeout(400);
  };
  const tapAt = async (x, y) => { await touch("touchStart", [[x, y]]); await touch("touchEnd", []); };

  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  // The app is locked at 1x.
  const vp = await page.locator('meta[name="viewport"]').getAttribute("content");
  assert.match(vp, /maximum-scale=1/);
  assert.match(vp, /user-scalable=no/);
  // The map still pinch-zooms.
  await page.locator(".leaflet-container").waitFor();
  // The bids map fits itself to the pins right after it opens (twice): pinch once it has settled.
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length > 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const z0 = await page.evaluate(() => Number((document.querySelector(".leaflet-proxy")?.style.transform.match(/scale\(([\d.]+)\)/) || [])[1] || 0));
  await pinchAt(195, 300, 60, 240);
  await page.waitForTimeout(600);
  const z1 = await page.evaluate(() => Number((document.querySelector(".leaflet-proxy")?.style.transform.match(/scale\(([\d.]+)\)/) || [])[1] || 0));
  assert.ok(z1 > z0, `map zoomed in by the pinch (${z0} -> ${z1})`);
  assert.equal(await page.evaluate(() => window.visualViewport?.scale || 1), 1, "the app itself did not zoom");
  // A job page full screen: pinch zooms the page.
  await openBidList(page);
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-bid-thumb"]').length >= 1, null, { timeout: 90000 });
  await page.locator('[data-hpd-smoke="fc-bid-pages-btn"]', { has: page.locator('[data-hpd-smoke="fc-bid-thumb"]') }).first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-pages-sheet"]');
  await sheet.locator('[data-hpd-smoke="fc-itb-thumb"] img').first().waitFor({ timeout: 20000 });
  await sheet.locator('[data-hpd-smoke="fc-itb-thumb"]').first().click();
  const box = page.locator('[data-hpd-smoke="fc-itb-zoombox"]');
  await box.waitFor();
  const zoomOf = async () => Number(await box.getAttribute("data-zoom"));
  assert.equal(await zoomOf(), 1);
  const b = await box.boundingBox();
  await pinchAt(b.x + b.width / 2, b.y + b.height / 3, 60, 200);
  const zp = await zoomOf();
  assert.ok(zp > 2.5 && zp <= 5, `page zoomed by the pinch: ${zp}`);
  const imgW = await box.locator("img").evaluate((i) => i.getBoundingClientRect().width);
  assert.ok(imgW > b.width * 2.4, "the page picture is bigger");
  assert.equal(await page.evaluate(() => window.visualViewport?.scale || 1), 1, "only the page zoomed, not the app");
  // The bar (Close etc.) stays the same size and on screen.
  const close = await page.locator('[data-hpd-smoke="fc-itb-close"]').boundingBox();
  assert.ok(close && close.x + close.width <= 390 && close.height >= 30, "Close still on screen");
  // Double-tap: back to 1x; again: zoomed in.
  await tapAt(b.x + 100, b.y + 200); await page.waitForTimeout(80); await tapAt(b.x + 100, b.y + 200); await page.waitForTimeout(300);
  assert.equal(await zoomOf(), 1, "double-tap zooms back out");
  await tapAt(b.x + 100, b.y + 200); await page.waitForTimeout(80); await tapAt(b.x + 100, b.y + 200); await page.waitForTimeout(300);
  assert.equal(await zoomOf(), 2.5, "double-tap zooms in");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/zoom-page.png` });
  // The 🔍 button still works.
  await page.locator('[data-hpd-smoke="fc-itb-zoom"]').click();
  assert.equal(await zoomOf(), 3);
  assert.deepEqual(errors, []);
  console.log(`PASS page zoom: the app is locked at 1x; the map pinch-zooms (${z0} -> ${z1}); HPD's page pinch-zooms to ${zp.toFixed(1)}x (app stays 1x, Close on screen); double-tap 1x <-> 2.5x; 🔍 works`);
  await context.close();
} finally {
  await browser.close();
}
