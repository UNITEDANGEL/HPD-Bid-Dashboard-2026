// Talking with the chat feels fluid (owner, 4 Nov: "make the fluid conversation more fluid, listen for the user after
// each response"). The microphone is faked. 1) 💬 on: when the phone cuts the mic off with words heard but never called
// final, the chat still answers them. 2) After the answer it listens again by itself.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => {
    window.__starts = 0; window.__queue = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 40); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__starts += 1; setTimeout(() => { const text = window.__queue.shift(); if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: false })] }); this.onend?.(); }, 150); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const box = page.locator('[data-hpd-smoke="fc-search"]');
  const panel = page.locator('[data-hpd-smoke="fc-agent"]');
  await box.fill("what do I have today"); await box.press("Enter"); await panel.waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__queue.push("read me the new bids"); });
  await panel.locator('[data-hpd-smoke="fc-agent-talk"]').click();
  await page.waitForFunction(() => /invitation|No open/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  const s0 = await page.evaluate(() => window.__starts);
  await page.waitForFunction((n) => window.__starts > n, s0, { timeout: 10000 });
  assert.equal(await panel.locator('[data-hpd-smoke="fc-agent-talk"]').getAttribute("aria-pressed"), "true", "still in conversation");
  assert.deepEqual(errors, []);
  console.log("PASS fluid talk: words heard but never final are still answered; after the answer it listens again by itself");
} finally {
  await browser.close();
}
