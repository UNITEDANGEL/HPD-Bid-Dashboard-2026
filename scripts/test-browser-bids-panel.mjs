// Bids open on the map first (owner, 16 Oct): the list is a bar at the bottom ("peek"); a short pull up shows
// half, a long pull the whole list, 🗺 Map folds it back. The invitation pins sit in the part of the map you
// can see (not under the header or the bar). Upright with Safari's toolbars and sideways.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const out = [];
try {
  for (const [w, h] of [[390, 664], [844, 340]]) {
    const where = `${w}x${h}`;
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
    await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
    await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
    const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
    await list.waitFor();
    await page.waitForTimeout(1500);
    assert.equal(await list.getAttribute("data-size"), "peek", `${where}: opens on the map`);
    assert.equal(await list.locator("ol").isVisible(), false);
    // Pins in the visible map: between the header and the bar.
    const inView = await page.evaluate(() => {
      const top = document.querySelector('[data-hpd-smoke="fc-bids-banner"]').getBoundingClientRect().bottom;
      const bottom = document.querySelector('[data-hpd-smoke="fc-bids-list"]').getBoundingClientRect().top;
      const pins = [...document.querySelectorAll(".fc-bid-pin")].map((p) => p.getBoundingClientRect());
      return { n: pins.length, ok: pins.filter((r) => r.top >= top - 4 && r.bottom <= bottom + 4 && r.left >= 0 && r.right <= innerWidth).length };
    });
    assert.ok(inView.n > 0 && inView.ok / inView.n >= 0.8, `${where}: pins in the visible map (${inView.ok}/${inView.n})`);
    // Pull up with a finger: short -> half, long -> full.
    const drag = async (dy) => {
      const b = await page.locator('[data-hpd-smoke="fc-bids-collapse"]').boundingBox();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - dy, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(350);
    };
    await drag(80);
    assert.equal(await list.getAttribute("data-size"), "half", `${where}: short pull -> half`);
    assert.equal(await list.locator("ol").first().isVisible(), true);
    const half = (await list.boundingBox()).height;
    await drag(120);
    assert.equal(await list.getAttribute("data-size"), "full", `${where}: pull again -> full`);
    assert.ok((await list.boundingBox()).height > half + 20, `${where}: full is taller than half`);
    // A row still opens its bid; Map folds the list back.
    await page.locator('[data-hpd-smoke="fc-bids-peek"]').click();
    assert.equal(await list.getAttribute("data-size"), "peek", `${where}: Map folds the list`);
    await page.locator('[data-hpd-smoke="fc-bids-collapse"]').click();
    assert.equal(await list.getAttribute("data-size"), "half", `${where}: tap the bar -> half`);
    await list.locator("ol > li > button:first-child").first().click();
    await page.locator('[data-hpd-smoke="fc-bid-sheet"]').waitFor({ timeout: 10000 });
    out.push(`${where}: ${inView.ok}/${inView.n} pins in view, half ${Math.round(half)}px`);
    await context.close();
  }
  console.log(`PASS bids panel: opens on the map, pull up half / full, Map folds it, rows open bids (${out.join("; ")})`);
} finally {
  await browser.close();
}
