// Owner, 16 Oct: (1) Notices split into two departments, never mixed: 💵 Procurement (pays you: rejected invoice /
// affidavit, corrections, print & mail) and 📋 Vendor tracking (Lewis / Gafur: due now, requests, messages).
// (2) The days choices sit in one small menu on the borough bar instead of a row of chips. (3) Icons pop up.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });

  // Days menu: one button, one row for the whole bar.
  const bar = page.locator('[data-hpd-smoke="fc-borough-bar"]');
  await bar.waitFor();
  const barBox = await bar.boundingBox();
  assert.ok(barBox.height <= 60, `borough bar is one row (${barBox.height}px)`);
  const btn = page.locator('[data-hpd-smoke="fc-days-menu-btn"]');
  await btn.click();
  const menu = page.locator('[data-hpd-smoke="fc-days-menu"]');
  await menu.waitFor();
  const items = await menu.locator("button").allInnerTexts();
  for (const want of ["Last 15 days", "Last 30 days", "Last 45 days", "Last 60 days", "Last 90 days", "This year", "All dates", "Custom dates…", "2024-25 jobs"]) assert.ok(items.some((t) => t.includes(want)), `menu has ${want}: ${items}`);
  await page.locator('[data-hpd-smoke="fc-days-last45"]').click();
  await menu.waitFor({ state: "detached" });
  assert.match(await btn.innerText(), /45d/);
  await btn.click();
  await page.locator('[data-hpd-smoke="fc-days-custom"]').click();
  await page.locator('[data-hpd-smoke="fc-quick-filters"]').waitFor();
  await page.locator('[data-hpd-smoke="fc-quick-filters"] button', { hasText: "Done" }).click();

  // Icons pop when pressed.
  const qn = bar.locator('button[aria-label="Queens"]');
  await qn.hover();
  await page.mouse.down();
  await page.waitForTimeout(250);
  const tf = await qn.evaluate((b) => getComputedStyle(b).transform);
  await page.mouse.up();
  assert.notEqual(tf, "none", "Queens button pops on press");

  // Notices: two departments with their own tabs.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const proc = page.locator('[data-hpd-smoke="fc-notice-dept-procure"]');
  const vend = page.locator('[data-hpd-smoke="fc-notice-dept-vendor"]');
  await proc.waitFor();
  for (const k of ["rejected", "corrections", "print"]) assert.equal(await proc.locator(`[data-hpd-smoke="fc-notice-tab-${k}"]`).count(), 1, `procurement has ${k}`);
  for (const k of ["priority", "requests", "messages"]) assert.equal(await vend.locator(`[data-hpd-smoke="fc-notice-tab-${k}"]`).count(), 1, `vendor tracking has ${k}`);
  assert.match(await vend.getAttribute("class"), /is-on/, "opens on vendor tracking's Due now");
  await page.locator('[data-hpd-smoke="fc-priorities"]').waitFor();
  await page.waitForTimeout(1500);
  const kinds = await page.locator('[data-hpd-smoke="fc-prio-item"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  assert.ok(kinds.every((k) => ["24h", "72h", "missing"].includes(k)), `Due now has vendor tracking only: ${[...new Set(kinds)]}`);
  await proc.locator('[data-hpd-smoke="fc-notice-tab-rejected"]').click();
  assert.match(await proc.getAttribute("class"), /is-on/);
  assert.doesNotMatch(await vend.getAttribute("class"), /is-on/);
  await page.locator('[data-hpd-smoke="fc-notices-rejected"]').waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="fc-priorities"]').count(), 0, "rejected paperwork is not mixed with vendor tracking");
  await page.screenshot({ path: process.env.SHOT || "notice-depts.png" });
  assert.deepEqual(errors, []);
  console.log(`PASS notice departments: Procurement (rejected / corrections / print) and Vendor tracking (due now ${kinds.length} / requests / messages) kept apart; days menu (15-90, year, all, custom, 2024-25) in one row; icons pop`);
  await context.close();
} finally {
  await browser.close();
}
