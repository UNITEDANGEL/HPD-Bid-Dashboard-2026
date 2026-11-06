// 🙂🎙 A more real helper (plan items 16-17) at iPhone size: in 🎨 three real-looking face previews to pick from (kept on the
// phone, the drawn person stays an option) and three voice samples: ▶ Hear says a sample without saving, "Use this voice" saves.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  // Waze never really opens in a test: the page it would go to is answered here.
  let waze = "";
  await c.route(/waze\.com/, (r) => { waze = r.request().url(); return r.fulfill({ contentType: "text/html", body: "<title>Waze</title>Waze" }); });
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (u) => { window.__said.push(u.text); window.__rate = u.rate; window.__voice = u.voice?.name || ""; setTimeout(() => u.onend?.(), 30); };
      const fake = [{ name: "Ava (Premium)", lang: "en-US" }, { name: "Evan (Enhanced)", lang: "en-US" }, { name: "Samantha", lang: "en-US" }];
      window.speechSynthesis.getVoices = () => fake;
      // The phone's voices are made up here: let the utterance take one.
      Object.defineProperty(SpeechSynthesisUtterance.prototype, "voice", { configurable: true, set(v) { this._v = v; }, get() { return this._v || null; } });
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; window.__hear = ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, 50); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-dress"]').waitFor({ timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-agent-dress"]').click();
  // Faces: drawn + 3 real previews.
  const faces = page.locator('[data-hpd-smoke="fc-dress-face"]');
  await faces.first().waitFor({ timeout: 3000 });
  assert.equal(await faces.count(), 4);
  assert.equal(await page.locator('[data-hpd-smoke="fc-dress-face"] [data-hpd-smoke="fc-face-real"]').count(), 3, "3 real previews, the drawn one has none");
  await page.locator('[data-hpd-smoke="fc-dress-face"][data-style="real2"]').click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-helper-look")).style), "real2");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-who"] svg[data-style="real2"]').count(), 1, "the helper in the chat uses the picked face");
  await page.locator('[data-hpd-smoke="fc-dress-face"][data-style="cartoon"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-who"] svg[data-style="cartoon"]').count(), 1);
  // Voices: 3 samples.
  const cards = page.locator('[data-hpd-smoke="fc-dress-sample-card"]');
  assert.equal(await cards.count(), 3);
  await page.evaluate(() => { window.__said = []; localStorage.removeItem("hpd-voice-name"); });
  await cards.nth(1).locator('[data-hpd-smoke="fc-dress-sample-play"]').click();
  await page.waitForFunction(() => window.__said.some((t) => /three jobs today/i.test(t)), null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-voice-name")), null, "hearing a sample saves nothing");
  const name = await cards.nth(1).getAttribute("data-voice");
  await cards.nth(1).locator('[data-hpd-smoke="fc-dress-sample-use"]').click();
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-voice-name")), name);
  assert.match(await cards.nth(1).locator('[data-hpd-smoke="fc-dress-sample-use"]').innerText(), /Using/);
  assert.deepEqual(errors, []);
  console.log("test-browser-real-helper OK");
} finally {
  await browser.close();
}
