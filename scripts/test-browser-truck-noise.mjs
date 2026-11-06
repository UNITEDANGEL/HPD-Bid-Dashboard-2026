// 🚚 It hears you in the truck (plan item 20): the stand-in mic hears words it isn't sure of (confidence 0.3, road
// noise): not a command it knows -> "I didn't catch that well. I heard: …" with one tap to use it; a command it knows
// ("plan my week") still runs even when unsure.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: { "CLAUDE-HEARTBEAT": { at: new Date().toISOString(), every: 9 } }, accepted: [] } }));
  await c.route("**/api/**", (r) => r.fulfill({ status: 503, json: { error: "test: no AI" } }));
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    window.__queue = [];
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const t = window.__queue.shift(); if (t) this.onresult?.({ results: [Object.assign([{ transcript: t, confidence: 0.3 }], { isFinal: true })] }); this.onend?.(); }, 200); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.evaluate(() => { window.__queue = ["blue whistle tomato"]; });
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await page.waitForFunction(() => /^🚚 I didn't catch that well\. I heard: "blue whistle tomato"/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-choice"]', { hasText: "blue whistle tomato" }).count(), 1, "one tap to use what it heard");
  // Said again, clearly enough to be a known command: it runs.
  await page.evaluate(() => { window.__queue = ["plan my week"]; });
  await page.locator('[data-hpd-smoke="fc-weekplan"]').waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log("PASS hears you in the truck: unsure + unknown -> \"I didn't catch that well\" with the words to tap; a known command still runs");
} finally {
  await browser.close();
}
