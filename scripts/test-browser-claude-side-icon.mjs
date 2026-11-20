// Claude working is a small icon on the side (owner, 20 Nov), not a strip on the map; tap it to open the live line.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.addInitScript(() => { try { localStorage.setItem("hpd-test-claude-icon", "1"); localStorage.setItem("hpd-side-open", "1"); } catch { /* */ } });
  const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
  const overrides = {
    "CLAUDE-HEARTBEAT": { at: ago(120), every: 9 },
    "CLAUDE-NOW": { at: ago(8), text: "Making the change", task: "Test task", state: "working", log: [{ at: ago(8), text: "Making the change" }] },
  };
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const icon = page.locator('[data-hpd-smoke="fc-claude-side-icon"]');
  await icon.waitFor({ timeout: 60000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-claude-live"]').count(), 0, "no strip on the map");
  const box = await icon.boundingBox();
  assert.ok(box.width <= 60 && box.x < 60, "a small icon at the side");
  await icon.click();
  await page.locator('[data-hpd-smoke="fc-claude-live"]').waitFor();
  await page.locator('[data-hpd-smoke="fc-claude-live-hide"]').click();
  await icon.waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS Claude working: small icon at the side, tap opens the live line, ◂ puts it back");
} finally {
  await browser.close();
}
