// With no signal the app shows "Waiting for signal ... saved on this phone"; with signal it is gone.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  const banner = page.locator('[data-hpd-smoke="signal-banner"]');
  assert.equal(await banner.count(), 0, "no banner while online");
  await context.setOffline(true);
  await banner.waitFor({ timeout: 10000 });
  assert.match(await banner.innerText(), /Waiting for signal.*saved on this phone/);
  await context.setOffline(false);
  await banner.waitFor({ state: "detached", timeout: 10000 });
  console.log("signal banner ok");
} finally { await browser.close(); }
