// Job counts in the 📅 menu (owner, 23 Oct: "I want to see the number of jobs I have when I choose 15 days"), at
// iPhone size with the real job file: every window in the menu shows its count, picking one puts exactly that many
// jobs on the map (the 📅 button's badge and the job count agree), and a longer window never has fewer jobs.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-days-btn-count"]').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-hpd-smoke="fc-days-btn-count"]')?.textContent) > 0, null, { timeout: 60000 });
  const count = async (key) => Number(((await page.locator(`[data-hpd-smoke="fc-days-count-${key}"]`).innerText()).match(/\d+/) || [0])[0]);
  const badge = async () => Number(await page.locator('[data-hpd-smoke="fc-days-btn-count"]').innerText());
  const seen = {};
  for (const key of ["last15", "last30", "last90", "year"]) {
    await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
    await page.locator('[data-hpd-smoke="fc-days-menu"]').waitFor();
    const n = await count(key);
    if (key === "last15" && shots) await page.screenshot({ path: `${shots}/day-counts-menu.png` });
    await page.locator(`[data-hpd-smoke="fc-days-${key}"]`).click();
    await page.waitForTimeout(400);
    assert.equal(await badge(), n, `${key}: the map shows the ${n} jobs the menu said`);
    seen[key] = n;
  }
  assert.ok(seen.last15 <= seen.last30 && seen.last30 <= seen.last90, `longer windows never have fewer jobs (${JSON.stringify(seen)})`);
  assert.deepEqual(errors, []);
  console.log(`PASS day counts: menu counts match the map after picking: 15 days ${seen.last15}, 30 days ${seen.last30}, 90 days ${seen.last90}, this year ${seen.year}`);
  await c.close();
} finally {
  await browser.close();
}
