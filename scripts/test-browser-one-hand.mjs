// 🖐 One-hand mode (idea list: "moves the main buttons to the bottom corner so you can reach everything with your thumb"):
// All → One-hand mode -> the search row, boroughs and Map / Locate sit in the bottom half, above the chat bar; the Year
// menu opens upward and stays on screen; kept after a reload; tapping again puts them back at the top.
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
  const open = async () => {
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  };
  const tops = () => page.evaluate(() => Object.fromEntries([["search", ".fc-search-row"], ["boroughs", ".fc-borough-bar"], ["map", ".fc-map-controls"], ["chat", ".fc-chatbar"]].map(([k, s]) => { const r = document.querySelector(s)?.getBoundingClientRect(); return [k, r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null]; })));
  await open();
  let t = await tops();
  assert.ok(t.search.top < 100 && t.boroughs.top < 150, `at the top first: ${JSON.stringify(t)}`);
  const row = page.locator('[data-hpd-smoke="fc-more-one-hand"]');
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  assert.match(await row.innerText(), /One-hand mode[\s\S]*Off/);
  await row.click();
  assert.match(await row.innerText(), /On: search and map buttons by your thumb/);
  await page.locator(".fc-more-scrim").click({ position: { x: 10, y: 10 } });
  t = await tops();
  for (const k of ["search", "boroughs", "map"]) assert.ok(t[k].top > 844 / 2, `${k} in the bottom half: ${JSON.stringify(t)}`);
  assert.ok(t.search.bottom <= t.chat.top, `search above the chat bar: ${JSON.stringify(t)}`);
  // The Year menu opens upward, on screen.
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  const menu = await page.locator('[data-hpd-smoke="fc-days-menu"]').boundingBox();
  assert.ok(menu.y >= 0 && menu.y + menu.height <= t.boroughs.top + 2, `Year menu above the boroughs: ${JSON.stringify(menu)}`);
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await open();
  t = await tops();
  assert.ok(t.search.top > 844 / 2, "kept after a reload");
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await row.click();
  await page.locator(".fc-more-scrim").click({ position: { x: 10, y: 10 } });
  t = await tops();
  assert.ok(t.search.top < 100, "off: back at the top");
  assert.deepEqual(errors, []);
  console.log("PASS one-hand mode: search, boroughs and Map/Locate move down above the chat bar, Year menu opens upward, kept on the phone, off puts them back");
} finally {
  await browser.close();
}
