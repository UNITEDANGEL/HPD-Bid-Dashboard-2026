// The bottom dock (28 Oct, owner picked layout 2: "i like it dont leave anything") at iPhone size: Jobs, Bids, ✨ AI,
// Notices and More along the bottom; a strip above it with Route, Appts, Follow-up, Stats, Alerts and What's new; More
// lists everything with what's waiting in it (weather, parking and the year too) and each row opens its screen. Map
// style, Locate and the year / borough buttons are still on the map. A job card hides the dock.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 1. The dock: five buttons in a row at the very bottom, labels readable (light on dark).
  const dock = page.locator('[data-hpd-smoke="fc-dock"]');
  await dock.waitFor({ timeout: 20000 });
  const labels = (await dock.locator(".fc-fab-label").allInnerTexts()).map((t) => t.trim());
  assert.deepEqual(labels, ["Jobs", "Bids", "AI", "Notices", "All"]);
  const box = await dock.boundingBox();
  assert.ok(Math.abs(box.y + box.height - 844) < 2 && box.width >= 389, `dock along the bottom: ${JSON.stringify(box)}`);
  // Round buttons like Map / Locate (owner, 28 Oct): dark text on a white label, under a colored circle.
  const look = await dock.locator('[data-hpd-smoke="fc-bids-open"]').evaluate((el) => { const l = getComputedStyle(el.querySelector(".fc-fab-label")); const s = getComputedStyle(el.querySelector("svg")); return { color: l.color, bg: l.backgroundColor, circle: s.borderRadius, fill: s.backgroundColor }; });
  const sum = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).reduce((a, n) => a + n, 0);
  assert.ok(sum(look.color) < 200 && sum(look.bg) > 700, `label readable (dark on white): ${JSON.stringify(look)}`);
  assert.equal(look.circle, "50%", "round button");
  assert.notEqual(look.fill, "rgba(0, 0, 0, 0)", "colored circle");

  // 2. Just one row (owner, 29 Oct: "too many buttons on the bottom"): no strip above it; the buttons still on the map.
  assert.equal(await page.locator('[data-hpd-smoke="fc-dock-strip"], .fc-dock-chip').count(), 0, "no second row of buttons");
  for (const sel of ['[data-hpd-smoke="fc-route-open"]', '[data-hpd-smoke="fc-stats-open"]']) assert.equal(await page.locator(sel).count(), 0, `${sel} not on the map until All is open`);
  for (const sel of ['[aria-label="Toggle map style"]', '[aria-label="Locate me"]', '[data-hpd-smoke="fc-days-menu-btn"]']) assert.ok(await page.locator(sel).isVisible(), `${sel} still on the map`);

  // 3. All: big round tiles (Route, Appts, Follow-up, Stats, Alerts, What's new) with their own colors, then the other rows.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-more-sheet"]');
  await sheet.waitFor({ timeout: 5000 });
  const tiles = (await sheet.locator('[data-hpd-smoke="fc-all-tiles"] .fc-fab-label').allInnerTexts()).map((t) => t.trim());
  assert.deepEqual(tiles, ["Route", "Appts", "Follow-up", "Stats", "Alerts", "What's new"]);
  const fills = await sheet.locator('[data-hpd-smoke="fc-all-tiles"] svg').evaluateAll((els) => els.map((s) => { const c = getComputedStyle(s); return `${c.backgroundColor} ${c.borderRadius}`; }));
  assert.equal(new Set(fills).size, 6, `each tile has its own color: ${fills.join(" | ")}`);
  assert.ok(fills.every((f) => f.endsWith("50%") && !f.startsWith("rgb(51, 65, 85)")), `round colored tiles: ${fills.join(" | ")}`);
  const tileBox = await sheet.locator('[data-hpd-smoke="fc-stats-open"]').boundingBox();
  assert.ok(tileBox.width >= 100 && tileBox.height >= 100, `big tiles: ${JSON.stringify(tileBox)}`);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-follow-open"]').innerText(), /Follow-up\s*\d+/, "Follow-up shows its count");
  const rows = (await sheet.locator(".fc-more-row b").allInnerTexts()).map((t) => t.trim());
  for (const want of ["Weather", "Parking (ASP)", "Year and dates", "Talk to the AI", "Bottom buttons", "Map style", "Where am I"]) assert.ok(rows.includes(want), `All has ${want}: ${rows.join(", ")}`);
  for (const gone of ["Today's route", "My stats", "What's new"]) assert.ok(!rows.includes(gone), `${gone} is a tile, not a row too`);
  await sheet.locator('[data-hpd-smoke="fc-stats-open"]').click();
  await page.locator('[data-hpd-smoke="fc-stats-sheet"]').waitFor({ timeout: 10000 });
  assert.equal(await sheet.count(), 0, "All closes when a tile opens its screen");
  await page.locator('[data-hpd-smoke="fc-stats-sheet"] header button').first().click();
  // The year and dates row opens the days menu.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-more-year"]').click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-days-menu-btn"]')?.getAttribute("aria-expanded") === "true", null, { timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  // Tapping outside the drawer closes it.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await sheet.waitFor({ timeout: 5000 });
  await page.mouse.click(195, 120);
  await sheet.waitFor({ state: "detached", timeout: 5000 });

  // 4. A job card hides the dock.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs"]').waitFor({ timeout: 15000 });
  const first = page.locator('[data-hpd-smoke="fc-jobs"] li button').first();
  if (await first.count()) {
    await first.click();
    await page.locator("#fc-job-card").waitFor({ timeout: 15000 });
    assert.equal(await dock.count(), 0, "no dock behind a job card");
  }
  assert.deepEqual(errors, []);
  await c.close();
  console.log(`PASS dock: one row Jobs · Bids · AI · Notices · All at the bottom (readable), no strip; All has 6 big round colored tiles that open their screens plus ${rows.length} rows (weather, parking, year too), Map / Locate / Year still on the map, a job card hides the dock`);
} finally {
  await browser.close();
}
