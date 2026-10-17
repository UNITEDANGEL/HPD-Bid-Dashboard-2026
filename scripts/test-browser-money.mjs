// Rejections tracked to the money (owner, 17 Oct), on an iPhone with the real data: Notices shows the dollars held on
// Payment rejected and on each pin; Procurement -> 💰 To get paid lists each rejection with its six steps to paid in
// PIP, biggest money first, and the next thing to do.
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
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 20, null, { timeout: 120000 });

  // The picker: "$X held" on Payment rejected; picking it tags each pin with its dollars.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const held = page.locator('[data-hpd-smoke="fc-notice-held"]');
  await held.waitFor({ timeout: 20000 });
  const heldText = await held.innerText();
  assert.match(heldText, /^\$[\d,]+ held$/);
  await page.locator('[data-hpd-smoke="fc-notice-pick-rejected"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll(".is-glow .fc-glow-tag")].some((t) => /^💵 \$[\d,]+$/.test(t.textContent || "")), null, { timeout: 15000 });
  if (shots) await page.screenshot({ path: `${shots}/money-1-map.png` });

  // The list: Procurement -> 💰 To get paid.
  await page.locator('[data-hpd-smoke="fc-notice-pick-list"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-tab-money"]').click();
  const box = page.locator('[data-hpd-smoke="fc-money"]');
  await box.waitFor();
  const sum = await box.locator('[data-hpd-smoke="fc-money-sum"]').innerText();
  assert.ok(sum.includes(heldText.replace(" held", "")), `same total: ${sum} / ${heldText}`);
  const rows = box.locator('[data-hpd-smoke="fc-money-row"]');
  const n = await rows.count();
  assert.ok(n > 3, `rows: ${n}`);
  const amounts = (await box.locator("li.is-held .fc-money-top strong").allInnerTexts()).filter((a) => a.includes("$"));
  const dollars = amounts.map((a) => Number(a.replace(/[^\d]/g, "")));
  assert.deepEqual([...dollars].sort((a, b) => b - a), dollars, "biggest money first");
  assert.equal(await rows.first().locator(".fc-money-steps li").count(), 6);
  const fixLink = box.locator('[data-hpd-smoke="fc-money-fix"]').first();
  if (await fixLink.count()) assert.match(await fixLink.getAttribute("href"), /^\/paperwork\/\?job=[A-Z]{2}\d{5}&fix=.+&auto=1$/);
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: `${shots}/money-2-list.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS money: ${heldText} on Payment rejected and $ tags on the pins; 💰 To get paid lists ${n} rejections (${sum.replace(/\s+/g, " ")}), biggest first, 6 steps each, Auto-fix for the next one to fix`);
  await context.close();
} finally {
  await browser.close();
}
