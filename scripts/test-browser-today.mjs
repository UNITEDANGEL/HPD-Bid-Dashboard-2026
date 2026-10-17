// Morning summary (owner, 17 Oct) on an iPhone with the real data: what needs doing today, one tap to each place.
// (A real phone shows it by itself the first time the app opens each day; test browsers open it with ?today=1.)
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1&today=1`, { waitUntil: "load", timeout: 180000 });
  const card = page.locator('[data-hpd-smoke="fc-today"]');
  await card.waitFor();
  await page.waitForFunction(() => /\d+ missing-documents/.test(document.querySelector('[data-hpd-smoke="fc-today-docs"]')?.textContent || "") && !/^0 missing/.test(document.querySelector('[data-hpd-smoke="fc-today-docs"] b')?.textContent || ""), null, { timeout: 30000 });
  const lines = {};
  for (const k of ["due", "docs", "money", "bids"]) lines[k] = await card.locator(`[data-hpd-smoke="fc-today-${k}"]`).innerText();
  assert.match(lines.due, /notices? due today|No 24 \/ 72-hour deadline today/);
  assert.match(lines.money, /\$[\d,]+ held by rejections/);
  assert.match(lines.bids, /bids? due today|invitations? open/);
  if (shots) await page.screenshot({ path: `${shots}/today-1.png` });

  // Missing documents -> the board, on that filter; the summary is done for today.
  await card.locator('[data-hpd-smoke="fc-today-docs"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor();
  assert.equal(await board.locator('[data-hpd-smoke="fc-board-show-docs"]').getAttribute("aria-selected"), "true");
  assert.ok((await board.locator(".fc-board-row:not(.is-docs)").count()) === 0);
  await board.locator('[data-hpd-smoke="fc-board-close"]').click();
  assert.equal(await card.count(), 0, "not shown again after it's been seen");
  const seen = await page.evaluate(() => localStorage.getItem("hpd-summary-seen"));
  assert.equal(seen, await page.evaluate(() => new Date().toLocaleDateString("en-CA")));

  // Reopen it from the notices picker; the money line opens 💰 To get paid.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-today-open"]').click();
  await card.waitFor();
  await card.locator('[data-hpd-smoke="fc-today-money"]').click();
  await page.locator('[data-hpd-smoke="fc-money"]').waitFor();
  assert.deepEqual(errors, []);
  console.log(`PASS today: ${lines.due.split("\n")[1] || lines.due} | ${lines.docs.replace(/\n/g, " · ")} | ${lines.money.replace(/\n/g, " · ")} | ${lines.bids.replace(/\n/g, " · ")}; docs -> board (missing docs), seen for today, reopened from Notices, money -> 💰 To get paid`);
  await context.close();
} finally {
  await browser.close();
}
