// 🤖 Autopilot (23 Oct) at iPhone size: Map menu -> Autopilot shows what runs by itself; the texting service says how to
// connect it when it isn't; the "first text on every new award" switch saves to the status server (answered here) under
// SETTINGS-AUTOPILOT, so the 10-minute alert job sees it, and it stays after a reload.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posts = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") { posts.push({ url: r.request().url(), body: r.request().postData() }); return r.fulfill({ json: { ok: true } }); } return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const open = async () => {
    const menu = page.locator('[aria-label="Show map controls"], [aria-label*="menu" i]').first();
    await menu.click();
    await page.locator('[data-hpd-smoke="fc-autopilot-open"]').click();
    await page.locator('[data-hpd-smoke="fc-autopilot"]').waitFor({ timeout: 15000 });
  };
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await open();
  const panel = page.locator('[data-hpd-smoke="fc-autopilot"]');
  assert.match(await panel.locator('[data-hpd-smoke="fc-autopilot-sms"]').innerText(), /Not connected yet[\s\S]*Twilio[\s\S]*sms-inbound/, "how to connect texting");
  const toggle = panel.locator('[data-hpd-smoke="fc-autopilot-autotext-toggle"]');
  assert.match(await toggle.innerText(), /^On/, "on by default (the owner said yes)");
  if (shots) await page.screenshot({ path: `${shots}/autopilot.png` });
  await toggle.click();
  await panel.locator('[data-hpd-smoke="fc-autopilot-status"]', { hasText: "Off: nothing is texted by itself" }).waitFor({ timeout: 10000 });
  const saved = posts.find((p) => /\/override$/.test(p.url) && /SETTINGS-AUTOPILOT/.test(p.body || ""));
  assert.ok(saved, "saved on the status server");
  assert.deepEqual(JSON.parse(saved.body).patch, { autoTenantText: false });
  await panel.locator('[data-hpd-smoke="fc-autopilot-close"]').click();
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await open();
  assert.match(await page.locator('[data-hpd-smoke="fc-autopilot-autotext-toggle"]').innerText(), /^Off/, "the switch stays off after a reload");
  assert.deepEqual(errors, []);
  console.log("PASS autopilot: Map menu -> Autopilot; texting not connected says how; the award-text switch saved SETTINGS-AUTOPILOT {autoTenantText:false} and stayed off after a reload");
  await c.close();
} finally {
  await browser.close();
}
