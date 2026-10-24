// Bid by voice (23 Oct, from the recommendations: "bid 500 on this one"), at iPhone size with real invitations: open a
// bid, tap its 🎤 and say "bid 980" -> the helper answers, the price is filled and saved (the bid document is made), and
// nothing is faxed: Send is still two taps. Speech is faked here; no fax or email leaves this test.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 3).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let faxes = 0;
  await c.route(/\/api\/drive\/fax-bid/, (r) => { faxes += 1; return r.fulfill({ json: { sent: true } }); });
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 60); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })], resultIndex: 0 }); this.onend?.(); }, 50); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li > button:first-child').first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  const omo = (await sheet.locator("header strong").innerText()).trim();
  // "What should I bid?" first: the open bid answers with its recommended price (or says there isn't enough to go on).
  await page.evaluate(() => { window.__hear = "what should I bid"; });
  await sheet.locator('[data-hpd-smoke="fc-bid-mic"]').click();
  await page.waitForFunction((o) => new RegExp(`For ${o}, I'd bid about \\$[\\d,]+|enough recent awards for jobs like ${o}`).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), omo, { timeout: 20000 });
  const advice = (await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText()).trim();
  console.log(`  advice: ${advice}`);
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.evaluate(() => { window.__hear = "bid 980 on this one"; });
  await sheet.locator('[data-hpd-smoke="fc-bid-mic"]').click();
  await page.waitForFunction((o) => new RegExp(`\\$980.*${o}`).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), omo, { timeout: 20000 });
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue(), "980", "the price is filled");
  // Saved: a far-above price asks for its second tap (said by you, not the voice); otherwise the bid document is made.
  if (await sheet.locator('[data-hpd-smoke="fc-bid-high"]').count()) await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 60000 });
  if (shots) await page.screenshot({ path: `${shots}/bid-voice.png` });
  assert.equal(faxes, 0, "nothing faxed: Send is still two taps");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').innerText(), /Send/i);
  assert.deepEqual(errors, []);
  console.log(`PASS bid by voice: ${omo} 🎤 "bid 980 on this one" -> helper answered, $980 filled and saved, bid document made, nothing faxed`);
  await c.close();
} finally {
  await browser.close();
}
