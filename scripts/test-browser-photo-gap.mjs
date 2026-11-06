// 📸 Photos before paperwork (plan item 28), on an iPhone with no photos saved: "I finished EQ15239", yes -> the
// paperwork opens with "No before or after photos on this phone yet. HPD needs them…" and "📷 Add photos first" goes
// back to the job.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("I finished EQ15239");
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').press("Enter");
  await page.locator('[data-hpd-smoke="fc-agent-yes"]').click({ timeout: 15000 });
  const sheet = page.locator('[data-hpd-smoke="fc-package-sheet"]');
  await sheet.waitFor({ timeout: 20000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-package-photo-gap"]').innerText(), /No before or after photos on this phone yet\. HPD needs them/);
  await sheet.locator('[data-hpd-smoke="fc-package-add-photos"]').click();
  assert.equal(await sheet.count(), 0, "back to the job to take them");
  assert.deepEqual(errors, []);
  console.log("PASS photos before paperwork: the paperwork card says the photos are missing, Add photos first goes back to the job");
} finally {
  await browser.close();
}
