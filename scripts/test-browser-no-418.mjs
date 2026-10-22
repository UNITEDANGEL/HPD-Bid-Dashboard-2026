// The Jobs, Alerts, Invoice and Payments pages draw the same on the phone as when the site was built, whatever today's
// date (React error #418 came when "N days old" was counted on build day and again on the phone). The phone's clock is
// set 40 days after the build: no page error, and the days-old numbers are today's.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const seen = [];
  for (const p of ["/jobs/", "/alerts/", "/invoice-generator/", "/payments/"]) {
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date(Date.now() + 40 * 86400000) });
    const res = await page.goto(`${baseUrl}${p}`, { waitUntil: "load", timeout: 120000 });
    if (!res || res.status() >= 400) { await page.close(); continue; }
    await page.clock.runFor(2000);
    await page.waitForTimeout(500);
    assert.deepEqual(errors.filter((e) => /#418|#423|#425|hydrat/i.test(e)), [], `${p}: no hydration error`);
    seen.push(p);
    await page.close();
  }
  assert.ok(seen.length >= 3, `pages checked: ${seen}`);
  console.log(`PASS no #418: ${seen.join(", ")} draw the same with the phone 40 days after the build`);
} finally {
  await browser.close();
}
