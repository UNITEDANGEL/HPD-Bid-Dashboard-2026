// 🔊 Read the bid out loud (idea "bid-read-aloud"): on HPD's work description, full screen, 🔊 Read has the phone's own
// voice read the work while the page pans; 🔇 Stop stops it; once on, the next description opened is read by itself;
// Price it / Close stop the voice. The bar still fits an iPhone. The phone's voice is a stand-in here (nothing is spoken).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const order = { omo: "ER09499", bidDue: tomorrow, bidDueTime: "11:00 AM", address: "47-46 40 STREET", borough: "QN", itbFile: "ER09499_103026111433.pdf", description: "APARTMENT #1H ENTRANCE DOOR RE-ALIGN DOOR REPLACE ALL HINGES", notes: "", descPages: [2], pages: 4, lat: 40.74051, lng: -73.925196 };
const other = fetched.bids.find((b) => b.itbFile && Number.isFinite(b.lat) && b.omo !== "ER09499" && (b.descPages || [3])[0] === 3 && !b.lead);
assert.ok(other, "an invitation with its job description on page 3");
const bids = [order, { ...other, bidDue: tomorrow, bidDueTime: "11:01 AM" }];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.addInitScript(() => {
    try { if (!sessionStorage.getItem("walk-set")) { localStorage.setItem("hpd-bid-walk", "on"); sessionStorage.setItem("walk-set", "1"); } } catch { /* private mode */ }
    window.__said = []; window.__cancels = 0;
    const synth = { speaking: false, getVoices: () => [{ name: "Test", lang: "en-US" }], cancel() { window.__cancels += 1; }, speak(u) { window.__said.push(u.text); if (!window.__mute && u.text.trim()) setTimeout(() => u.onstart && u.onstart(), 20); }, resume() {}, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length > 0, null, { timeout: 60000 });
  await page.locator('[data-hpd-smoke="fc-bids-welcome-start"]').click({ timeout: 30000 });
  const full = page.locator('[data-hpd-smoke="fc-itb-full"]');
  await full.waitFor({ timeout: 30000 });
  const first = (await full.locator(".fc-itb-bar b").innerText()).trim();
  // The phone's warm-up (a blank " ") doesn't count as reading.
  const said = () => page.evaluate(() => window.__said.filter((t) => t.trim()));
  const all = page.locator('[data-hpd-smoke="fc-itb-voice-all"]');
  const sum = page.locator('[data-hpd-smoke="fc-itb-voice-summary"]');
  await all.waitFor({ timeout: 10000 });
  assert.equal((await all.innerText()).trim(), "🔊 Read it all");
  assert.equal((await sum.innerText()).trim(), "📝 Summary");
  assert.deepEqual(await said(), [], "nothing read until you ask");
  const bar = await page.locator(".fc-itb-bar").evaluate((el) => ({ fits: el.scrollWidth <= el.clientWidth + 1 }));
  assert.ok(bar.fits, "the page bar fits the iPhone");
  const row = await page.locator('[data-hpd-smoke="fc-itb-voice-row"]').boundingBox();
  assert.ok(row && row.x >= 0 && row.x + row.width <= 390 && row.y + row.height <= 844, "the voice buttons are on the screen");
  // Read it all: HPD's own words, the whole description.
  await all.click();
  const s1 = await said();
  assert.equal(s1.length, 1);
  assert.equal(s1[0], "ER09499. APARTMENT #1H ENTRANCE DOOR RE-ALIGN DOOR REPLACE ALL HINGES", "the whole description, word for word");
  assert.equal((await all.innerText()).trim(), "🔇 Stop");
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-read-voice")), "all");
  const c0 = await page.evaluate(() => window.__cancels);
  await all.click();
  assert.ok((await page.evaluate(() => window.__cancels)) > c0, "Stop stops the voice");
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-read-voice")), "off");
  // Summary: the short version, read and shown on the page.
  await sum.click();
  const s2 = await said();
  assert.equal(s2.length, 2);
  assert.ok(s2[1].length > 3 && s2[1] !== s1[0], `a summary is read: ${s2[1]}`);
  const box = page.locator('[data-hpd-smoke="fc-itb-summary"]');
  assert.match(await box.innerText(), /The work in short/);
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-read-voice")), "summary");
  // The phone never starts the voice (owner's iPhone, 9 Nov "button is not working"): asked once more, then it says so.
  await sum.click(); // stop
  await page.evaluate(() => { window.__mute = true; });
  const n0 = (await said()).length;
  await all.click();
  const note = page.locator('[data-hpd-smoke="fc-itb-voice-note"]');
  await note.waitFor({ timeout: 6000 });
  assert.match(await note.innerText(), /didn't start the voice.*ringer/);
  assert.equal((await said()).length, n0 + 2, "tried twice");
  assert.equal((await all.innerText()).trim(), "🔊 Read it all", "the button is ready again");
  await page.evaluate(() => { window.__mute = false; });
  await sum.click();
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-itb-voice-note"]'), null, { timeout: 3000 });
  // Price it: the voice stops and the summary goes; the next bid's summary is read by itself.
  const c1 = await page.evaluate(() => window.__cancels);
  await page.locator('[data-hpd-smoke="fc-itb-price"]').click();
  assert.ok((await page.evaluate(() => window.__cancels)) > c1, "leaving the page stops the voice");
  await page.locator('[data-hpd-smoke="fc-bid-next"]').click();
  await page.waitForFunction((f) => { const b = document.querySelector('[data-hpd-smoke="fc-itb-full"] .fc-itb-bar b'); return b && b.textContent.trim() !== f; }, first, { timeout: 30000 });
  await page.waitForFunction(() => window.__said.filter((t) => t.trim()).length >= 3, null, { timeout: 15000 });
  const s3 = await said();
  assert.notEqual(s3[2], s2[1], "the other bid's summary is read");
  await box.waitFor({ timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-itb-close"]').click();
  assert.deepEqual(errors, []);
  console.log("PASS bid read aloud: 🔊 Read it all reads HPD's whole description word for word, 📝 Summary reads the short version and shows it, 🔇 Stop stops; the choice is kept: the next bid's summary is read by itself; when the phone doesn't start the voice it tries again and then says so; Price it stops it; fits the iPhone");
} finally {
  await browser.close();
}
