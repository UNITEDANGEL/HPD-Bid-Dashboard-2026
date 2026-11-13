// 🚗 Driving mode (owner, 3 Nov, pick 4 of making the chat smarter) at iPhone size. Hearing, speaking and the GPS
// are faked. 1) The phone moves at 25 mph: "🚗 Looks like you're driving. Talk hands-free?" over the chat bar.
// 2) 🚗 Turn on: the helper says driving mode is on and starts listening. 3) "what's new" is answered: the whole answer
// on screen, only the first sentence or two said. 4) Silence: it keeps listening (normal talk mode stops after 2).
// 5) "I'm parked": off, it stops listening.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  // The real status server is never read or written by tests (12 Nov: an open owner question there covered the map).
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => {
    window.__said = []; window.__queue = []; window.__starts = 0;
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 40); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__starts += 1; setTimeout(() => { const text = window.__queue.shift(); if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })], resultIndex: 0 }); this.onend?.(); }, 120); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
    // Driving through Queens at about 25 mph.
    const fix = (i) => ({ coords: { latitude: 40.7 + i * 0.001, longitude: -73.85, accuracy: 10, speed: 11.2, heading: 0, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
    navigator.geolocation.watchPosition = (ok) => { let i = 0; ok(fix(i++)); const t = setInterval(() => ok(fix(i++)), 800); return t; };
    navigator.geolocation.getCurrentPosition = (ok) => ok(fix(0));
    navigator.geolocation.clearWatch = (t) => clearInterval(t);
  });
  await c.grantPermissions(["geolocation"]);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 1) The offer.
  const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"]');
  for (let i = 0; i < 6; i++) {
    await nudge.waitFor({ timeout: 40000 });
    if ((await nudge.getAttribute("data-kind")) === "drive") break;
    await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click();
  }
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /Looks like you're driving/);
  assert.equal(await nudge.locator('[data-hpd-smoke="fc-face"]').getAttribute("data-mode"), "talking", "the helper's face says it");
  // 2) On.
  await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-driving"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /Driving mode on/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-drive"]').getAttribute("aria-pressed"), "true");
  await page.waitForFunction(() => window.__starts >= 1, null, { timeout: 10000 });
  // 3) A long answer, said short.
  await page.evaluate(() => { window.__said = []; window.__queue.push("what's new"); });
  await page.waitForFunction(() => /Newest in the app/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  await page.waitForFunction(() => window.__said.length > 0, null, { timeout: 10000 });
  const shown = await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  const said = await page.evaluate(() => window.__said[window.__said.length - 1]);
  assert.ok(said.length <= 220 && said.length < shown.length - 20,`said ${said.length} of ${shown.length}: ${said}`);
  // 4) Silence: still listening after several quiet turns.
  const s0 = await page.evaluate(() => window.__starts);
  // Up to 15 s for 3 more starts (a fixed 5 s saw only 2 on the busy build machine, 11 Nov).
  await page.waitForFunction((s) => window.__starts - s >= 3, s0, { timeout: 15000 }).catch(() => {});
  const s1 = await page.evaluate(() => window.__starts);
  assert.ok(s1 - s0 >= 3, `kept listening (${s1 - s0} more starts)`);
  assert.doesNotMatch(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /Stopped listening/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/driving.png` }).catch(() => {});
  // 5) Off.
  await page.evaluate(() => { window.__queue.push("I'm parked"); });
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-agent-driving"]'), null, { timeout: 15000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /Driving mode off/);
  const s2 = await page.evaluate(() => window.__starts);
  await page.waitForTimeout(3000);
  assert.ok((await page.evaluate(() => window.__starts)) - s2 <= 1, "stopped listening");
  assert.deepEqual(errors, []);
  console.log(`PASS driving: 25 mph -> offer over the chat; 🚗 Turn on -> on and listening; "what's new" shown in full (${shown.length} letters), said short (${said.length}); ${s1 - s0} quiet turns and still listening; "I'm parked" -> off`);
} finally {
  await browser.close();
}
