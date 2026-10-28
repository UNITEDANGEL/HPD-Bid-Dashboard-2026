// 🅿️ No street cleaning + 🚗 drive time on the map (28 Oct, "keep upgrading") at iPhone size: on a holiday (Election
// Day, Tue 3 Nov 2026) a "🅿️ No ASP" chip sits next to the weather and tapping it says why; on a normal Wednesday
// there's no chip. With the phone's location on, the Next pill says how many minutes away the job is.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function open({ at, gps = false, texted = "" }) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", ...(gps ? { geolocation: { latitude: 40.7128, longitude: -74.006, accuracy: 20 }, permissions: ["geolocation"] } : {}) });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { bids: [] } }));
  if (texted) await c.addInitScript((j) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [j]: { TenantTextedAt: new Date(Date.now() - 2 * 86400000).toISOString(), TenantRepliedAt: "" } })); sessionStorage.setItem("seeded", "1"); } }, texted);
  const page = await c.newPage();
  await page.clock.install({ time: new Date(at) });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  return { c, page, errors };
}
try {
  // 1. Election Day, noon: the chip, and what it says.
  {
    const { c, page, errors } = await open({ at: "2026-11-03T17:00:00Z" });
    const chip = page.locator('[data-hpd-smoke="fc-asp-chip"]');
    await chip.waitFor({ timeout: 20000 });
    assert.match(await chip.innerText(), /No ASP/);
    await chip.click();
    await page.waitForFunction(() => /suspended \(Election Day\)/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
    assert.deepEqual(errors, []);
    await c.close();
  }
  // 2. A normal Wednesday: no chip. 3. The Next pill (call the tenant) with the phone's location: minutes away.
  {
    const { c, page, errors } = await open({ at: "2026-10-28T16:00:00Z", gps: true, texted: "EQ15239" });
    const pill = page.locator('[data-hpd-smoke="fc-next-chip"]');
    await pill.waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-hpd-smoke="fc-asp-chip"]').count(), 0, "street cleaning is on: no chip");
    await page.locator('[data-hpd-smoke="fc-next-drive"]').waitFor({ timeout: 20000 });
    const words = (await pill.innerText()).replace(/\s+/g, " ");
    const min = Number(/🚗 (\d+) min/.exec(words)?.[1]);
    // Lower Manhattan to 1207 1 Ave is about 4 miles in a straight line: 15-25 minutes at midday.
    assert.ok(min >= 15 && min <= 25, `drive ${min} min: ${words}`);
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS ASP chip + drive time: Election Day shows 🅿️ No ASP (tap: suspended, Election Day), a normal Wednesday none; the Next pill says 🚗 N min from the phone's location");
} finally {
  await browser.close();
}
