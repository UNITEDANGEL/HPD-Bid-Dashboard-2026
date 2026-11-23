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
  // Which date (owner, 23 Nov: "more options ... maturity, award date is also important"): Maturity / Award / Start /
  // Finish at the top of the menu; the menu stays open, the counts follow the date picked, and the button says it.
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-days-field-maturity"]').click();
  await page.locator('[data-hpd-smoke="fc-days-menu"]').waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="fc-days-field-maturity"]').getAttribute("aria-checked"), "true");
  for (const key of ["next7", "next30", "next60", "last7"]) assert.equal(await page.locator(`[data-hpd-smoke="fc-days-${key}"]`).count(), 1, `${key} in the menu`);
  const mat30 = await count("next30");
  await page.locator('[data-hpd-smoke="fc-days-next30"]').click();
  await page.waitForTimeout(400);
  assert.equal(await badge(), mat30, `maturity next 30 days: the map shows the ${mat30} jobs the menu said`);
  assert.match(await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').innerText(), /Maturity Next 30/);
  // Roomier menu (owner, 23 Nov: "it scrolls why, fix it, make icons better, more info not just days"): on an iPhone the
  // whole menu fits with no scrolling, each date has its icon and meaning, each window shows its real dates, and a line
  // tells the next maturity date and the days left.
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-days-menu"]').waitFor();
  await page.waitForTimeout(300);
  const fit = await page.locator('[data-hpd-smoke="fc-days-menu"]').evaluate((m) => { const r = m.getBoundingClientRect(); return { bg: getComputedStyle(m).backgroundColor, scroll: m.scrollHeight - m.clientHeight, left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight }; });
  assert.ok(fit.scroll <= 1, `the date menu fits without scrolling (${JSON.stringify(fit)})`);
  assert.ok(fit.left >= 0 && fit.right <= fit.w && fit.bottom <= fit.h - 130, `the date menu stays on the screen, above the dock and Talk to Claude bar (${JSON.stringify(fit)})`);
  assert.match(await page.locator('[data-hpd-smoke="fc-days-field-maturity"]').innerText(), /⏳[\s\S]*Maturity[\s\S]*complete-by/);
  assert.match(await page.locator('[data-hpd-smoke="fc-days-field-award"]').innerText(), /🏆[\s\S]*Award/);
  assert.match(await page.locator('[data-hpd-smoke="fc-days-next30"]').innerText(), /Next 30 days[\s\S]*[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}/);
  const info = await page.locator('[data-hpd-smoke="fc-days-info"]').innerText();
  assert.match(info, /⏳ (Next maturity [A-Z][a-z]{2} \d{1,2} · (today|\d+ days? left)|No maturity dates coming up)/);
  if (shots) await page.screenshot({ path: `${shots}/day-menu-roomy.png` });
  await page.locator('[data-hpd-smoke="fc-days-field-award"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-days-info"]').innerText(), /🏆 Last award [A-Z][a-z]{2} \d{1,2} · (today|\d+ days? ago)/);
  await page.locator('[data-hpd-smoke="fc-days-menu-btn"]').click();
  assert.deepEqual(errors, []);
  console.log(`PASS day counts: menu counts match the map after picking: 15 days ${seen.last15}, 30 days ${seen.last30}, 90 days ${seen.last90}, this year ${seen.year}; maturity next 30 days ${mat30}; menu fits with no scrolling; next maturity: ${info}`);
  await c.close();
} finally {
  await browser.close();
}
