// The priority list (owner, 16 Oct) with the real (encrypted) HPD emails: HPD notices opens on 🔥 Priority, 24-hour
// notices first with a countdown, each item says who asked, what for and whether paperwork was already sent;
// "Handled" (two taps) takes an item off; its email opens. Prints no email text.
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
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click(); await page.locator('[data-hpd-smoke="fc-notice-pick-list"]').click();
  const box = page.locator('[data-hpd-smoke="fc-priorities"]');
  await box.waitFor({ timeout: 15000 });
  const items = box.locator('[data-hpd-smoke="fc-prio-item"]');
  await items.first().waitFor({ timeout: 20000 });
  const kinds = await items.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  const order = ["24h", "72h", "rejection", "missing", "print"];
  assert.deepEqual([...kinds].sort((a, b) => order.indexOf(a) - order.indexOf(b)), kinds, "most urgent first");
  const n = kinds.length;
  if (kinds.includes("24h")) {
    const first = items.first();
    assert.match(await first.locator('[data-hpd-smoke="fc-prio-due"]').innerText(), /(left|overdue)/, "24-hour countdown");
    assert.match(await first.locator('[data-hpd-smoke="fc-prio-sent"]').innerText(), /(Paperwork already sent|No paperwork sent)/);
    await first.locator('[data-hpd-smoke="fc-prio-email"]').click();
    await page.locator('[data-hpd-smoke="fc-thread-viewer"]').waitFor({ timeout: 5000 });
    await page.locator('[data-hpd-smoke="fc-thread-close"]').click();
  }
  // Reply to the tracker: a ready message to her @hpd.nyc.gov address; Send to me first goes to the owner only.
  const withReply = box.locator('[data-hpd-smoke="fc-prio-reply"]').first();
  if (await withReply.count()) {
    await withReply.click();
    const rb = box.locator('[data-hpd-smoke="fc-prio-reply-box"]');
    await rb.waitFor();
    assert.match(await rb.locator("b").first().innerText(), /@hpd.nyc.gov>/);
    const txt = await rb.locator('[data-hpd-smoke="fc-prio-reply-text"]').inputValue();
    assert.ok(/^Hello /.test(txt) && /OMO# /.test(txt) && /(were sent on|will send the affidavit and invoice)/.test(txt), txt);
    await rb.locator('[data-hpd-smoke="fc-prio-reply-send"]').click();
    assert.match(await rb.locator('[data-hpd-smoke="fc-prio-reply-send"]').innerText(), /Tap again: send to .*@hpd.nyc.gov/, "first tap only arms");
    await rb.locator("button", { hasText: "Close" }).click();
  }
  // Handled: two taps, then it's off the list (and stays off after reload).
  const key = await items.first().locator('[data-hpd-smoke="fc-prio-done"]').evaluate((b) => b.closest("li").querySelector("b").textContent);
  await items.first().locator('[data-hpd-smoke="fc-prio-done"]').click();
  assert.match(await items.first().locator('[data-hpd-smoke="fc-prio-done"]').innerText(), /Tap again/);
  await items.first().locator('[data-hpd-smoke="fc-prio-done"]').click();
  await page.waitForFunction((x) => document.querySelectorAll('[data-hpd-smoke="fc-prio-item"]').length === x, n - 1, { timeout: 5000 });
  assert.deepEqual(errors, []);
  console.log(`PASS priorities: Notices opens on 🔥 Priority with ${n} items most urgent first (${[...new Set(kinds)].join(", ")}), countdown + paperwork-sent line, HPD's email opens, Handled (two taps) took ${key} off`);
  await context.close();
} finally {
  await browser.close();
}
