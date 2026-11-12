// 📱 A tenant texted 2+ days ago who never answered: the chat speaks up with a follow-up text to check (plan item 38).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const old = new Date(Date.now() - 3 * 86400000).toISOString();
  await c.addInitScript(({ old }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ EQ15239: { TenantTextedAt: old, ItbTenantPhone: "718-555-0100", ItbTenantAccessType: "Tenant", ItbTenantContactStatus: "" } }));
    sessionStorage.setItem("seeded", "1");
  }, { old });
  const page = await c.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date() });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"][data-kind="quiet"]');
  for (let i = 0; i < 12 && !(await nudge.count()); i++) {
    const other = page.locator('[data-hpd-smoke="fc-chat-nudge"]:not([data-kind="quiet"]) [data-hpd-smoke="fc-chat-nudge-close"]');
    if (await other.count()) await other.first().click();
    await page.clock.runFor(61000);
  }
  await nudge.waitFor();
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /^📱 No answer from the tenant at .* in 2 days\./);
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]').getAttribute("href"), /^sms:/);
  assert.deepEqual(errors, []);
  await c.close();
  console.log("PASS quiet tenant: after 2 days with no answer the chat offers a follow-up text to check and send");
} finally {
  await browser.close();
}
