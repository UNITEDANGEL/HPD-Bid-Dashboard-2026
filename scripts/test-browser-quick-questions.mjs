// Quick answer buttons in the chat (owner idea, 3 Nov), at iPhone size: a row of one-tap questions sits above the chat
// bar; tapping one makes the helper answer without typing, and the row hides while you type.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/`, { waitUntil: "load", timeout: 180000 });
  const bolt = page.locator('[data-hpd-smoke="fc-chatbar-bolt"]');
  await bolt.waitFor({ timeout: 90000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-chatbar-quick"]').count(), 0, "row is folded away at first");
  await bolt.tap();
  const row = page.locator('[data-hpd-smoke="fc-chatbar-quick"]');
  await row.waitFor({ timeout: 90000 });
  const buttons = page.locator('[data-hpd-smoke="fc-quick-q"]');
  assert.ok((await buttons.count()) >= 4, "at least four quick questions");
  const box = await row.boundingBox();
  const bar = await page.locator('[data-hpd-smoke="fc-chatbar"]').boundingBox();
  assert.ok(box.y + box.height <= bar.y + 4, "row sits above the chat bar");
  assert.ok(box.x >= 0 && box.x + box.width <= 391, "row fits the phone width");
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("hello");
  assert.equal(await row.count(), 0, "row hides while typing");
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("");
  await row.waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-quick-q"][data-ask="next bid"]').tap();
  await page.locator('[data-hpd-smoke="fc-agent"]').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-heard"]').innerText().then((t) => /next bid/i.test(t)), true, "helper heard the tapped question");
  assert.deepEqual(errors, []);
  console.log("quick questions: ok");
} finally {
  await browser.close();
}
