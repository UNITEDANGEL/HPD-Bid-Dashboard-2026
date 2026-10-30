// 🤖 Claude live (owner, 30 Oct: "when I'm talking to AI and it's sending a request to Claude, I should be able to see the
// progress of the request ... live request updates, so I know what's going on in the background") at iPhone size: an
// open request shows on the map with "working on it now", the step bar (2/5), the step being done and the last note;
// × hides it until the next note, which comes in by itself (checked every 20 s while a request is open); tapping it
// opens Your requests; a request said to the AI shows up on the card right away. Status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const id = "20261030120000";
const overrides = {
  [`CHANGE-REQUEST-${id}`]: { at: ago(30), text: "(said to the helper) Let me change any date on the affidavit" },
  [`CHANGE-REPLY-${id}`]: { status: "Working on it", workingAt: ago(2), updates: [{ at: ago(25), text: "Got it, looking now." }, { at: ago(3), text: "Found what locks the date; fixing it." }],
    steps: [{ text: "Find the lock", done: true }, { text: "Date box on the card", done: true }, { text: "Live progress", done: false }, { text: "Test", done: false }, { text: "Push live", done: false }] },
};
const posted = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      posted.push(b);
      if (String(b?.key || "").startsWith("CHANGE-REQUEST-")) overrides[b.key] = b.patch;
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, 100); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const card = page.locator('[data-hpd-smoke="fc-claude-live"]');
  await card.waitFor({ timeout: 20000 });
  const text = (await card.innerText()).replace(/\s+/g, " ");
  assert.match(text, /🤖 Claude · working on it now/);
  assert.match(text, /“Let me change any date on the affidavit”/, "the request, without the (said to the helper) tag");
  assert.match(text, /2\/5 · Now: Live progress/);
  assert.match(text, /Found what locks the date; fixing it\. · 3 min ago/);
  assert.match(await card.getAttribute("class"), /is-working/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/claude-live.png` }).catch(() => {});
  // × hides it; the next note brings it back by itself (no reload).
  await page.locator('[data-hpd-smoke="fc-claude-live-hide"]').click();
  assert.equal(await card.count(), 0);
  overrides[`CHANGE-REPLY-${id}`] = { ...overrides[`CHANGE-REPLY-${id}`], updates: [...overrides[`CHANGE-REPLY-${id}`].updates, { at: new Date().toISOString(), text: "Date box is on the card; testing on iPhone size." }],
    steps: overrides[`CHANGE-REPLY-${id}`].steps.map((s, i) => ({ ...s, done: i < 3 })) };
  await card.waitFor({ timeout: 35000 });
  const text2 = (await card.innerText()).replace(/\s+/g, " ");
  assert.match(text2, /3\/5 · Now: Test/);
  assert.match(text2, /Date box is on the card; testing on iPhone size\. · just now/);
  // Tap -> Your requests.
  await card.locator(".fc-claude-live-main").click();
  await page.waitForFunction(() => /Let me change any date on the affidavit/.test(document.body.innerText), null, { timeout: 10000 });
  // Said to the AI: on the card right away, "got it, starting soon".
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  overrides[`CHANGE-REPLY-${id}`] = { ...overrides[`CHANGE-REPLY-${id}`], status: "Done", updates: [...overrides[`CHANGE-REPLY-${id}`].updates, { at: ago(60), text: "Live." }] };
  overrides[`CHANGE-REPLY-${id}`].updates.sort((a, b) => a.at.localeCompare(b.at));
  await page.evaluate(() => { window.__hear = "tell Claude to make the map buttons bigger"; });
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  await page.waitForFunction(() => /Sent to Claude/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.ok(posted.some((b) => String(b.key).startsWith("CHANGE-REQUEST-") && /map buttons bigger/i.test(b.patch?.text || "")), "request sent");
  await page.waitForFunction(() => /got it, starting soon/.test(document.querySelector('[data-hpd-smoke="fc-claude-live"]')?.textContent || "") && /map buttons bigger/i.test(document.querySelector('[data-hpd-smoke="fc-claude-live"]')?.textContent || ""), null, { timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log("PASS Claude live: open request on the map (working now, 2/5 · Now: step, last note · N min ago); × hides it until the next note, which arrives by itself (3/5); tap opens Your requests; a request said to the AI shows at once (got it, starting soon)");
  await c.close();
} finally {
  await browser.close();
}
