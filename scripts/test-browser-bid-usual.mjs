// "Bid the usual" (owner, 3 Nov, pick 3 of making the chat smarter: remember my habits) at iPhone size. Three earlier
// bids on the same kind of work were sent at $900, $1,000 and $1,200 (records on this phone); the 4th is open:
// (past their deadline, so only the record's own work description says what they were) "bid the usual" fills $1,000 (the middle of the last 3) and saves it, the helper says where it came from, nothing is
// faxed. Without a bid open it asks to open one first. Invitations and records are test data; no fax leaves.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + n * 86400000));
const src = fetched.bids.filter((b) => b.itbFile).slice(0, 4);
const description = src[0].description;
const bids = src.map((b, i) => ({ ...b, description, bidDue: i === 0 ? day(1) : day(-3 - i), bidDueTime: "11:00 AM" }));
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const records = Object.fromEntries(bids.slice(1).map((b, i) => [b.omo, { omo: b.omo, address: b.address || "", borough: b.borough, bidDue: b.bidDue, bidDueTime: "11:00 AM", price: [900, 1000, 1200][i], savedAt: ago(5 + i), sentAt: ago(5 + i), sentPrice: [900, 1000, 1200][i], status: "sent", work: description.slice(0, 1200) }]));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let faxes = 0;
  await c.route(/\/api\/drive\/fax-bid/, (r) => { faxes += 1; return r.fulfill({ json: { sent: true } }); });
  await c.addInitScript((recs) => {
    if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-bid-records-v1", JSON.stringify(recs)); sessionStorage.setItem("seeded", "1"); }
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 30);
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })], resultIndex: 0 }); this.onend?.(); }, 50); }
      stop() { this.onend?.(); }
    };
  }, records);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const reply = () => page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();

  // Without a bid open.
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("bid the usual");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /Open the bid first/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // The open bid.
  await page.goto(`${baseUrl}/map/?bids=1&omo=${bids[0].omo}`, { waitUntil: "load", timeout: 180000 });
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor({ timeout: 60000 });
  assert.equal((await sheet.locator("header strong").innerText()).trim(), bids[0].omo);
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("");
  // The chat bar hides over an open bid: said through the bid's 🎤 (hearing faked).
  await page.evaluate(() => { window.__hear = "bid the usual"; });
  await sheet.locator('[data-hpd-smoke="fc-bid-mic"]').click();
  await page.waitForFunction(() => /Your usual for/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  const r = await reply();
  // Newest first.
  assert.match(r, /Your usual for .+: \$1,000 \(your last 3 bids: \$900 on \w+, \$1,000 on \w+, \$1,200 on \w+\)\. Saving it on/);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-price"]').inputValue(), "1000");
  if (await sheet.locator('[data-hpd-smoke="fc-bid-high"]').count()) await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 60000 });
  assert.equal(faxes, 0, "nothing faxed: Send is still two taps");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bid-usual.png` }).catch(() => {});
  assert.deepEqual(errors, []);
  console.log(`PASS bid the usual: no bid open -> "Open the bid first"; on ${bids[0].omo} -> "${r.slice(0, 120)}…", $1,000 filled and saved, nothing faxed`);
} finally {
  await browser.close();
}
