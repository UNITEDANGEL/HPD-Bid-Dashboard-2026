// The helper must not open the phone keyboard by itself (owner, 14 Nov); the keyboard button does.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const overrides = { "CLAUDE-HEARTBEAT": { at: ago(60), every: 9 } };
const posted = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { const b = r.request().postDataJSON(); posted.push(b); overrides[b.key] = { ...(overrides[b.key] || {}), ...b.patch }; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  const page = await c.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("hpd-claude-card", "big"); } catch { /* private mode */ } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();

  const input = page.locator('[data-hpd-smoke="fc-agent-type-input"]');
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("data-hpd-smoke") === "fc-agent-type-input");
  // Opening the helper never raises the keyboard.
  if (await input.count()) { await input.waitFor(); await page.waitForTimeout(500); assert.equal(await focused(), false, "no keyboard when the helper opens"); await page.locator('[data-hpd-smoke="fc-agent-type-btn"]').click(); await input.waitFor({ state: "detached" }); }
  // The keyboard button does.
  await page.locator('[data-hpd-smoke="fc-agent-type-btn"]').click();
  await input.waitFor();
  await page.waitForTimeout(300);
  assert.equal(await focused(), true, "the keyboard button puts the cursor in the box");
  assert.deepEqual(errors, []);
  console.log("no-keyboard test passed");
} finally {
  await browser.close();
}
