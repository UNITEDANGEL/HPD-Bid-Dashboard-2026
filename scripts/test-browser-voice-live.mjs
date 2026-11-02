// Voice always on hand + Claude live every few seconds (owner, 2 Nov: "the voice is not active anymore ... I want the
// voice to be active and the chat very interactive; I need to know exactly what's going on every second") at iPhone size.
// 1) A phone that can't listen by itself (no SpeechRecognition, like Chrome on iPhone): the chat bar still has 🎙; it
//    opens the keyboard (input focused) with the tip to use the keyboard's 🎙; typed / dictated text is answered out loud.
// 2) 🔊 / 🔇 on the chat bar shows and switches spoken answers (remembered on the phone).
// 3) Claude working: the card shows "⚡ <now line> · N s ago" counting every second and "🔄 Live: checked N s ago";
//    a new "now" line written on the status server shows up within a few seconds, no reload. Status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const id = "20261102150000";
const overrides = {
  "CLAUDE-HEARTBEAT": { at: ago(2), every: 9 },
  [`CHANGE-REQUEST-${id}`]: { at: ago(10), text: "Make the voice active again" },
  [`CHANGE-REPLY-${id}`]: { status: "Working on it", workingAt: ago(1), now: { at: new Date(Date.now() - 4000).toISOString(), text: "Reading the voice code" }, updates: [{ at: ago(8), text: "Got it." }],
    steps: [{ text: "Find why", done: true }, { text: "Fix", done: false }, { text: "Test", done: false }] },
};
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") return r.fulfill({ json: { ok: true } });
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  await c.addInitScript(() => {
    // Chrome on iPhone: no listening in the page.
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 3) Claude live first (the card is on the map while nothing else is open).
  const card = page.locator('[data-hpd-smoke="fc-claude-live"]');
  await card.waitFor({ timeout: 20000 });
  const now = card.locator('[data-hpd-smoke="fc-claude-live-now"]');
  await now.waitFor({ timeout: 10000 });
  const n1 = await now.innerText();
  assert.match(n1, /⚡ Reading the voice code · \d+ s ago/);
  await page.waitForTimeout(2100);
  assert.notEqual(await now.innerText(), n1, "the seconds count");
  assert.match(await card.locator('[data-hpd-smoke="fc-claude-live-checked"]').innerText(), /🔄 Live: checked \d+ s ago/);
  overrides[`CHANGE-REPLY-${id}`] = { ...overrides[`CHANGE-REPLY-${id}`], now: { at: new Date().toISOString(), text: "Running the tests on iPhone size" } };
  const t0 = Date.now();
  await page.waitForFunction(() => /Running the tests on iPhone size/.test(document.querySelector('[data-hpd-smoke="fc-claude-live-now"]')?.textContent || ""), null, { timeout: 9000 });
  const lag = Date.now() - t0;
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/voice-live.png` }).catch(() => {});
  await page.locator('[data-hpd-smoke="fc-claude-live-hide"]').click();
  // Asked in the chat: "what's Claude doing" -> the answer stays live and changes by itself with the next "now" line.
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("what's Claude doing");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  await page.waitForFunction(() => /Claude is working on “Make the voice active again” right now/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  const r1 = await reply.innerText();
  assert.match(r1, /1 of 3 steps done, next: Fix\./);
  assert.match(r1, /⚡ Now: Running the tests on iPhone size \(\d+ s ago\)\./);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-live"]').count(), 1);
  await page.waitForFunction(() => window.__said.some((t) => /Claude is working on/.test(t)), null, { timeout: 5000 });
  const saidBefore = await page.evaluate(() => window.__said.length);
  overrides[`CHANGE-REPLY-${id}`] = { ...overrides[`CHANGE-REPLY-${id}`], now: { at: new Date().toISOString(), text: "Pushing it live" }, steps: overrides[`CHANGE-REPLY-${id}`].steps.map((x, i) => ({ ...x, done: i < 2 })) };
  await page.waitForFunction(() => /⚡ Now: Pushing it live/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 9000 });
  assert.match(await reply.innerText(), /2 of 3 steps done, next: Test\./);
  assert.ok(!(await page.evaluate((n) => window.__said.slice(n), saidBefore)).some((t) => /Claude is working on/.test(t)), "the live answer isn't said again");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 1) The mic is there even without listening; it opens the keyboard with the tip.
  const mic = page.locator('[data-hpd-smoke="fc-chatbar-mic"]');
  await mic.waitFor({ timeout: 10000 });
  assert.equal(await mic.getAttribute("data-listen"), "keyboard");
  await mic.click();
  assert.ok(await page.evaluate(() => document.activeElement?.getAttribute("data-hpd-smoke") === "fc-chatbar-input"), "the chat box has the keyboard");
  assert.match(await page.locator('[data-hpd-smoke="fc-chatbar-tip"]').innerText(), /tap the 🎙 at the bottom of the keyboard/);
  // 2) 🔊 on; the answer to what the keyboard heard is said out loud.
  const voice = page.locator('[data-hpd-smoke="fc-chatbar-voice"]');
  assert.equal(await voice.innerText(), "🔊");
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("which notices are open");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-reply"]').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => window.__said.some((t) => t.trim().length > 10), null, { timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-chatbar-tip"]').count(), 0, "the tip goes once you send");
  // The typing box has its 🎙 too, and it hands over the keyboard.
  const typeMic = page.locator('[data-hpd-smoke="fc-agent-type-mic"]');
  if (await typeMic.count()) { await typeMic.click(); assert.ok(await page.evaluate(() => document.activeElement?.getAttribute("data-hpd-smoke") === "fc-agent-type-input")); }
  // Close the helper; 🔇 turns spoken answers off (and it stays off after a reload), 🔊 back on.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await voice.click();
  assert.equal(await voice.innerText(), "🔇");
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-voice-off")), "1");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-chatbar-voice"]')?.textContent === "🔇", null, { timeout: 60000 });
  await page.locator('[data-hpd-smoke="fc-chatbar-voice"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-chatbar-voice"]').innerText(), "🔊");
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-voice-off")), null);
  assert.deepEqual(errors, []);
  console.log(`PASS voice + live: no listening -> 🎙 opens the keyboard with the tip, answer said out loud; 🔊/🔇 kept; Claude's "⚡ now" line counts seconds and a new one arrived in ${(lag / 1000).toFixed(1)} s`);
  await c.close();
} finally {
  await browser.close();
}
