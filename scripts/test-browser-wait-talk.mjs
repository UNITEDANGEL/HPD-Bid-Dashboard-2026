// 🗣 It waits while you're still talking (plan item 14): in a conversation, "plan my" + a short pause + "week" is ONE
// question ("plan my week"), not two half answers.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: { "CLAUDE-HEARTBEAT": { at: new Date().toISOString(), every: 9 } }, accepted: [] } }));
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    // A stand-in microphone: each time it listens it hears the next words in window.__queue (nothing when empty).
    window.__queue = [];
    window.__starts = 0;
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__starts += 1; setTimeout(() => { const t = window.__queue.shift(); if (t) this.onresult?.({ results: [Object.assign([{ transcript: t }], { isFinal: true })] }); this.onend?.(); }, 200); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.evaluate(() => { window.__queue = ["plan my", "week"]; });
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await page.locator('[data-hpd-smoke="fc-weekplan"]').waitFor({ timeout: 20000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /^🗓 Your week, planned:/);
  assert.ok(await page.evaluate(() => window.__starts) >= 2, "it listened again for the rest");
  assert.deepEqual(errors, []);
  console.log("PASS waits while you talk: \"plan my\" … \"week\" = one question, the week plan");
} finally {
  await browser.close();
}
