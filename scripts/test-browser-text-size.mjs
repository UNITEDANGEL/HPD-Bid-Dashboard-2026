// 🔠 Bigger text (owner, 6 Nov: "I see very small text ... zoom everything up"): the side button's A / A+ / A++ makes the
// cards and sheets bigger (the map stays as it is), and it's remembered after a reload.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => { try { if (!sessionStorage.getItem("t")) { sessionStorage.setItem("t", "1"); localStorage.setItem("hpd-test-side", "1"); localStorage.removeItem("hpd-side-open"); } } catch {} });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  // 🤖 One Claude (10 Nov): no side tab on the map edge; the text size is in Claude's chat.
  const orb = page.locator('[data-hpd-smoke="fc-claude-orb"]');
  await orb.waitFor({ timeout: 60000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-side-tab"]').count(), 0, "no side tab on the map");
  await orb.click();
  await page.locator('[data-hpd-smoke="fc-agent-tools"]').waitFor({ timeout: 15000 });
  await page.locator('[data-hpd-smoke="fc-agent-text-3"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.textSize), "1.3");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.textSize === "1.3", null, { timeout: 30000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const zoom = await page.locator('[data-hpd-smoke="fc-notice-chooser"]').evaluate((el) => getComputedStyle(el).zoom);
  assert.equal(String(zoom), "1.3", "the notices box is bigger");
  assert.deepEqual(errors, []);
  console.log("PASS text size: A++ from Claude's chat (no side tab), cards and sheets bigger, kept after a reload");
} finally {
  await browser.close();
}
