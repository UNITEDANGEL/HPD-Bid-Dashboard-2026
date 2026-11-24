// 📅 Job card dates (owner, 24 Nov: "I need to see all dates on job card award start complete"): a row of 3 dates at the
// top of the card (Award, Start, Complete), big and fitting an iPhone; the full date list below is open.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"]').fill(JOB);
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  const strip = page.locator('[data-hpd-smoke="jc-date-strip"]');
  await strip.waitFor({ timeout: 20000 });
  const info = await strip.evaluate((el) => ({
    text: el.innerText,
    cells: [...el.children].map((c) => { const r = c.getBoundingClientRect(); return { w: r.width, right: r.right, over: c.scrollWidth > c.clientWidth + 1 }; }),
    vw: window.innerWidth,
    dateSize: parseFloat(getComputedStyle(el.querySelector("b")).fontSize),
  }));
  assert.equal(info.cells.length, 3, "3 dates");
  assert.match(info.text, /Award/);
  assert.match(info.text, /Start|Work started/);
  assert.match(info.text, /Complete by|Work done/);
  assert.ok(info.cells.every((c) => c.right <= info.vw && !c.over), `dates fit the phone: ${JSON.stringify(info.cells)}`);
  assert.ok(info.dateSize >= 16, "dates are big");
  assert.ok(!/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(info.text), `one date style (mm/dd/yy): ${info.text}`);
  assert.equal(await page.locator("#fc-job-card details.jc-dates").evaluate((d) => d.open), true, "full date list open");
  assert.deepEqual(errors, []);
  console.log(`PASS job card dates: ${info.text.replace(/\s+/g, " ")}`);
} finally {
  await browser.close();
}
