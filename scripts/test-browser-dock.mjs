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
  assert.deepEqual(labels, ["Jobs", "Bids", "AI", "Notices", "More"]);
  const box = await dock.boundingBox();
  assert.ok(Math.abs(box.y + box.height - 844) < 2 && box.width >= 389, `dock along the bottom: ${JSON.stringify(box)}`);
  // Round buttons like Map / Locate (owner, 28 Oct): dark text on a white label, under a colored circle.
  const look = await dock.locator('[data-hpd-smoke="fc-bids-open"]').evaluate((el) => { const l = getComputedStyle(el.querySelector(".fc-fab-label")); const s = getComputedStyle(el.querySelector("svg")); return { color: l.color, bg: l.backgroundColor, circle: s.borderRadius, fill: s.backgroundColor }; });
  const sum = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).reduce((a, n) => a + n, 0);
  assert.ok(sum(look.color) < 200 && sum(look.bg) > 700, `label readable (dark on white): ${JSON.stringify(look)}`);
  assert.equal(look.circle, "50%", "round button");
  assert.notEqual(look.fill, "rgba(0, 0, 0, 0)", "colored circle");

  // 2. The strip above it, and the buttons still on the map.
  const strip = (await page.locator('[data-hpd-smoke="fc-dock-strip"] .fc-dock-chip').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  for (const want of [/^Route/, /^Appts/, /^Follow-up/, /^Stats/, /^Alerts/, /what's new/]) assert.ok(strip.some((t) => want.test(t)), `strip has ${want}: ${strip.join(" | ")}`);
  // Each strip button has its own color (Route green, Appts blue, Follow-up amber, Stats purple).
  const fills = await page.locator('[data-hpd-smoke="fc-dock-strip"]').evaluate((el) => ["fc-route-open", "fc-appts-open", "fc-follow-open", "fc-stats-open"].map((s) => getComputedStyle(el.querySelector(`[data-hpd-smoke="${s}"] svg`)).backgroundColor));
  assert.equal(new Set(fills).size, 4, `strip buttons each have their own color: ${fills.join(" | ")}`);
  assert.ok(!fills.includes("rgb(51, 65, 85)"), `no plain slate strip button: ${fills.join(" | ")}`);
  for (const sel of ['[aria-label="Toggle map style"]', '[aria-label="Locate me"]', '[data-hpd-smoke="fc-days-menu-btn"]']) assert.ok(await page.locator(sel).isVisible(), `${sel} still on the map`);

  // 3. More: everything, with counts; a row opens its screen.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-more-sheet"]');
  await sheet.waitFor({ timeout: 5000 });
  const rows = (await sheet.locator(".fc-more-row b").allInnerTexts()).map((t) => t.trim());
  for (const want of ["Jobs", "Bids", "HPD notices", "Follow-up", "Appointments", "Today's route", "My stats", "Weather", "Parking (ASP)", "Year and dates", "Talk to the AI", "Map style", "Where am I", "Phone alerts", "What's new"]) assert.ok(rows.includes(want), `More has ${want}: ${rows.join(", ")}`);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-more-follow"]').innerText(), /\d+ overdue · \d+ due this week/);
  await sheet.locator('[data-hpd-smoke="fc-more-stats"]').click();
  await page.locator('[data-hpd-smoke="fc-stats-sheet"]').waitFor({ timeout: 10000 });
  assert.equal(await sheet.count(), 0, "More closes when a row opens its screen");
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
  console.log(`PASS dock: Jobs · Bids · AI · Notices · More at the bottom (readable), strip ${strip.length} chips, More lists ${rows.length} (weather, parking, year too) and opens them, Map / Locate / Year still on the map, a job card hides the dock`);
} finally {
  await browser.close();
}
