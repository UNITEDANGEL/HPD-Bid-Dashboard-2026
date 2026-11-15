// 🎤 Say a note after each job (idea, 14 Nov): tap the mic on the job card, say what you did, the app writes it on the job.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "ER06362";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route("**/api/drive/**", (r) => r.fulfill({ json: {} }));
  // A pretend microphone that "hears" one sentence.
  await c.addInitScript(() => {
    window.SpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ results: [[{ transcript: "patched the ceiling and painted two coats" }]] }); this.onend?.(); }, 200); }
      stop() {}
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="jc-notes"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="jc-note-say"]').click();
  await page.locator('[data-hpd-smoke="jc-note"]').first().waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-note"]').first().textContent(), /^Done \(.*\): Patched the ceiling and painted two coats\./);
  assert.match(await page.locator('[data-hpd-smoke="jc-note-say-msg"]').innerText(), /Saved on the job/);
  assert.deepEqual(errors, []);
  console.log("job-say-note browser test passed");
} finally {
  await browser.close();
}
