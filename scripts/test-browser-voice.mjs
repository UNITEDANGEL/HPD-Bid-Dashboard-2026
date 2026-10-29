// The helper's voice (27 Oct, "the app should feel premium") at iPhone size, with the phone's voices faked: the Alerts
// page lists natural English voices best first (Premium ★ on top, no novelty or other-language voices); a pick and
// a speed are remembered and used; what's said has no emoji ("58°F" -> "58 degrees"). On the map, while the helper is
// talking a 🔇 Stop button hushes it.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const fakeVoices = () => {
  const voices = [
    { name: "Bells", lang: "en-US", localService: true }, { name: "Samantha", lang: "en-US", localService: true },
    { name: "Fred", lang: "en-US", localService: true }, { name: "Ava (Premium)", lang: "en-US", localService: true },
    { name: "Thomas", lang: "fr-FR", localService: true }, { name: "Daniel", lang: "en-GB", localService: true },
  ];
  window.__said = []; window.__cancels = 0;
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; this.voice = null; this.rate = 1; this.lang = ""; } };
  let current = null;
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    getVoices: () => voices,
    speak: (u) => { window.__said.push({ text: u.text, voice: u.voice?.name || "", rate: u.rate }); current = u; setTimeout(() => { if (current === u) { current = null; u.onend?.(); } }, 4000); },
    cancel: () => { window.__cancels++; const u = current; current = null; u?.onend?.(); },
    addEventListener() {}, removeEventListener() {},
  } });
};
try {
  // 1. Alerts page: the picker.
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await c.addInitScript(fakeVoices);
    const page = await c.newPage();
    await page.goto(`${baseUrl}/alerts/`, { waitUntil: "load", timeout: 180000 });
    const pick = page.locator('[data-hpd-smoke="fc-push-voice-name"]');
    await pick.waitFor({ timeout: 20000 });
    const options = await pick.locator("option").allInnerTexts();
    assert.equal(options[0], "Best on this phone (Ava (Premium))");
    assert.deepEqual(options.slice(1), ["Ava (Premium) ★", "Samantha", "Daniel"], "natural first; no Bells / Fred / French");
    await pick.selectOption("Samantha");
    await page.locator('[data-hpd-smoke="fc-push-rate-faster"]').click();
    // (Wait for the sample at the new speed: the voice pick says one at the old speed first.)
    await page.waitForFunction(() => window.__said.length >= 2 && window.__said[window.__said.length - 1].rate > 1, null, { timeout: 5000 });
    const last = await page.evaluate(() => window.__said[window.__said.length - 1]);
    assert.equal(last.voice, "Samantha");
    assert.ok(Math.abs(last.rate - 0.98 * 1.15) < 0.001, `rate ${last.rate}`);
    assert.match(last.text, /58 to 66 degrees, rain likely from 2 PM/);
    assert.doesNotMatch(last.text, /°/);
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem("hpd-voice-name"), localStorage.getItem("hpd-voice-rate")]), ["Samantha", "1.15"]);
    await c.close();
  }
  // 2. The map: the helper answers out loud; 🔇 Stop hushes it.
  {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await c.addInitScript(fakeVoices);
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('[data-hpd-smoke="fc-ai-orb"]').click();
    await page.locator('[data-hpd-smoke="fc-agent-type-btn"]').click();
    await page.locator('[data-hpd-smoke="fc-agent-type-input"]').fill("is alternate side on today");
    await page.locator('[data-hpd-smoke="fc-agent-type-send"]').click();
    const hush = page.locator('[data-hpd-smoke="fc-agent-hush"]');
    await hush.waitFor({ timeout: 10000 });
    await page.waitForFunction(() => window.__said.some((x) => /alternate side parking/.test(x.text)), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__said.find((x) => /alternate side parking/.test(x.text)).voice), "Ava (Premium)", "the best voice by default");
    const before = await page.evaluate(() => window.__cancels);
    await hush.click();
    await hush.waitFor({ state: "detached", timeout: 5000 });
    assert.ok(await page.evaluate((b) => window.__cancels > b, before), "speech cancelled");
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS voice: natural voices best first (Ava Premium ★, no novelty / French), pick + speed remembered and used, no emoji or ° said; on the map 🔇 Stop hushes the helper");
} finally {
  await browser.close();
}
