// 📍 "The job here" (plan item 21), on an iPhone standing at ER01720 (84-01 Main Street): "what job is this" opens
// that job's card, no number said.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", geolocation: { latitude: 40.713545, longitude: -73.816376, accuracy: 10 }, permissions: ["geolocation"] });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-locate"]').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // Standing at a job, the app may ask "Have you arrived?" first (it names the job): "Not yet", then ask by voice.
  const arrive = page.locator('[data-hpd-smoke="fc-arrive"]');
  if (await arrive.count()) { await page.locator('[data-hpd-smoke="fc-arrive-no"]').click(); }
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("what job is this");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /ER01720/.test(document.querySelector("#fc-job-card")?.textContent || ""), null, { timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log("PASS the job here: standing at 84-01 Main Street, \"what job is this\" opened ER01720");
} finally {
  await browser.close();
}
