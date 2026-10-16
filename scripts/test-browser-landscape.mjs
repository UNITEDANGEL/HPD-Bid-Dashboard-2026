// iPhone turned sideways (844 x 390, touch) and upright (390 x 844): the app uses the whole screen, every
// map button is on screen and not covered, HPD notices opens and scrolls, Bids opens and a second tap
// closes it, Notices opens from the bids screen, an open bid's Map button goes back to the map, and the
// bid shows the earlier jobs at the same building next to the price.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const { buildingHistory } = await loadLib("building-bids");
const market = (await (await fetch(`${baseUrl}/data/market_awards.json`)).json()).jobs || [];
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const withHistory = bids.find((b) => Number.isFinite(b.lat) && buildingHistory(b, market).length);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [w, h] of [[844, 390], [390, 844]]) {
    const where = `${w}x${h}`;
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context); // tenant data / invitation PDFs via the private route
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
    await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
    await page.waitForTimeout(800);
    const layout = await page.evaluate(() => {
      const app = document.querySelector(".fc-app").getBoundingClientRect();
      const bad = [...document.querySelectorAll(".fc-map-controls .fc-map-fab")].filter((b) => b.offsetParent).map((b) => {
        const r = b.getBoundingClientRect();
        const off = r.bottom > innerHeight || r.right > innerWidth || r.top < 0;
        const covered = !b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        return off || covered ? `${b.getAttribute("aria-label")}${off ? " off screen" : " covered"}` : "";
      }).filter(Boolean);
      return { width: Math.round(app.width), bad, count: document.querySelectorAll(".fc-map-controls .fc-map-fab").length };
    });
    assert.equal(layout.width, w, `${where}: app uses the whole width`);
    assert.deepEqual(layout.bad, [], `${where}: every map button reachable`);
    // HPD notices opens and scrolls; Close.
    await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
    const body = page.locator('[data-hpd-smoke="fc-notices-body"]');
    await body.waitFor({ timeout: 5000 });
    const scrolled = await body.evaluate(async (b) => { b.scrollTop = 600; await new Promise((r) => setTimeout(r, 100)); return b.scrollHeight <= b.clientHeight || b.scrollTop > 0; });
    assert.ok(scrolled, `${where}: notices scroll`);
    await page.locator('[data-hpd-smoke="fc-notices-sheet"] header button[aria-label="Close"]').click();
    // Notices again: the list opens again; Show all jobs brings every job back.
    await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
    await page.locator('[data-hpd-smoke="fc-notices-sheet"]').waitFor({ timeout: 5000 });
    await page.locator('[data-hpd-smoke="fc-notices-show-all"]').click();
    assert.equal(await page.locator('[data-hpd-smoke="fc-notices-open"]').getAttribute("aria-pressed"), "false", `${where}: Show all jobs closes the notices`);
    // Bids: open, second tap closes.
    await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
    await page.locator('[data-hpd-smoke="fc-bids-list"] li').first().waitFor({ timeout: 20000 });
    await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-bids-list"]'), null, { timeout: 5000 });
    // Notices from the bids screen.
    await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
    await page.locator('[data-hpd-smoke="fc-bids-list"] li').first().waitFor({ timeout: 20000 });
    await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
    await page.locator('[data-hpd-smoke="fc-notices-sheet"]').waitFor({ timeout: 5000 });
    await page.locator('[data-hpd-smoke="fc-notices-sheet"] header button[aria-label="Close"]').click();
    // An open bid: earlier jobs at the building, then Map goes back to the map.
    if (!(await page.locator('[data-hpd-smoke="fc-bids-list"]').count())) await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
    await page.locator('[data-hpd-smoke="fc-bids-list"] li').first().waitFor({ timeout: 20000 });
    if (withHistory) {
      await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li', { hasText: withHistory.omo }).first().locator("button").first().click();
      const hist = page.locator('[data-hpd-smoke="fc-bid-building-history"]');
      await hist.waitFor({ timeout: 10000 });
      assert.equal(await hist.locator("li").count(), Math.min(5, buildingHistory(withHistory, market).length), `${where}: earlier jobs at ${withHistory.address}`);
      assert.match(await hist.innerText(), /\$\d/);
      // A price far above what wins jobs like this: warning, Save needs a second tap, "Use" fixes it.
      const price = page.locator('[data-hpd-smoke="fc-bid-price"]');
      if (await price.isEnabled()) {
        await price.fill("25000");
        const warn = page.locator('[data-hpd-smoke="fc-bid-high"]');
        if (await warn.count()) {
          await page.locator('[data-hpd-smoke="fc-bid-save"]').click();
          assert.match(await page.locator('[data-hpd-smoke="fc-bid-save"]').innerText(), /Tap again to save/, `${where}: high price needs a second tap`);
          await warn.locator("button").click();
          assert.equal(await warn.count(), 0, `${where}: best price clears the warning`);
        }
        await price.fill("");
      }
      await page.locator('[data-hpd-smoke="fc-bid-to-map"]').click();
      await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-bid-sheet"]'), null, { timeout: 5000 });
      assert.ok(await page.locator(".fc-bids-list.is-collapsed").count(), `${where}: list folded so the map shows`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${where}: full width, ${layout.count} map buttons reachable, notices open + scroll + reopen + show all, bids open/close, notices from bids${withHistory ? `, ${withHistory.omo} building history + Map button` : ""}`);
    await context.close();
  }
} finally {
  await browser.close();
}
