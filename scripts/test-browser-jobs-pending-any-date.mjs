// Pending = every pending job, any date (owner, 10 Nov: "pending = all pending, no 60/90-day limit; completed = all
// completed; then pick dates to narrow it"). At iPhone size with the real job file: the map opens on Pending with the
// 📅 button on "Any date" (the this-year default doesn't hide older pending jobs); picking This year narrows it, and
// the menu's count for it matches the map; Archive keeps the this-year default.
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
  await page.goto(`${baseUrl}/map/?map=1`, { waitUntil: "load", timeout: 180000 });
  const btn = page.locator('[data-hpd-smoke="fc-days-menu-btn"]');
  await page.locator('[data-hpd-smoke="fc-days-btn-count"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-hpd-smoke="fc-days-btn-count"]')?.textContent) > 0, null, { timeout: 60000 });
  const badge = async () => Number(await page.locator('[data-hpd-smoke="fc-days-btn-count"]').innerText());

  assert.match(await btn.innerText(), /Any date/, "Pending opens on Any date, not the year");
  const anyDate = await badge();

  await btn.click();
  await page.locator('[data-hpd-smoke="fc-days-menu"]').waitFor();
  const yearInMenu = Number(((await page.locator('[data-hpd-smoke="fc-days-count-year"]').innerText()).match(/\d+/) || [0])[0]);
  await page.locator('[data-hpd-smoke="fc-days-year"]').click();
  await page.waitForTimeout(400);
  const year = await badge();
  assert.match(await btn.innerText(), /Year/, "a picked year shows Year");
  assert.equal(year, yearInMenu, "picking This year shows the jobs the menu said");
  assert.ok(year <= anyDate, `This year (${year}) never shows more than Any date (${anyDate})`);
  assert.deepEqual(errors, []);
  console.log(`PASS pending any date: Pending shows ${anyDate} jobs (any date); This year narrows it to ${year}`);
  await c.close();
} finally {
  await browser.close();
}
