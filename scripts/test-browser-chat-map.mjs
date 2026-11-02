// The chat on the map (owner, 2 Nov: "I want better flow, let's build a chat on the map"), at iPhone size: a bar right
// above the bottom buttons to type (or 🎤 talk); what's typed moves the map. "Show me the bids in Queens" -> only the
// Queens pins, a 📍 Queens chip to clear it; "next bid" -> the next bid to price opens; "where's my 3 PM" -> that
// appointment's job on the map with its card. Today's conversation stays after a reload. Speech and the status server are faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const mapped = fetched.bids.filter((b) => b.itbFile && Number.isFinite(b.lat));
assert.ok(mapped.length >= 3, "three invitations with a map spot");
// Two in Queens (due 10 and 11 AM tomorrow), one in Brooklyn (9 AM, first overall).
const bids = [
  { ...mapped[0], borough: "QN", bidDue: tomorrow, bidDueTime: "11:00 AM" },
  { ...mapped[1], borough: "QN", bidDue: tomorrow, bidDueTime: "10:00 AM" },
  { ...mapped[2], borough: "BK", bidDue: tomorrow, bidDueTime: "9:00 AM" },
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    // An appointment today 3-4 PM at EQ15239, confirmed.
    if (sessionStorage.getItem("seeded")) return;
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ EQ15239: { Appointment: { date: d, start: "15:00", end: "16:00", state: "confirmed", contact: "Tenant", phone: "", note: "", reminder: 60 } } }));
    sessionStorage.setItem("seeded", "1");
  });
  const page = await c.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const bar = page.locator('[data-hpd-smoke="fc-chatbar"]');
  const input = page.locator('[data-hpd-smoke="fc-chatbar-input"]');
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const waitReply = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 30000 });
  const say = async (text) => { await input.fill(text); await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click(); };
  const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.height ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null; }, sel);
  const clear = (a, b) => !a || !b || a.bottom <= b.top + 1 || b.bottom <= a.top + 1 || a.right <= b.left || b.right <= a.left;

  // 1. The bar sits right above the bottom buttons, on the screen, clear of the "Next:" chip.
  await bar.waitFor();
  const onMap = { bar: await rect('[data-hpd-smoke="fc-chatbar"]'), dock: await rect('[data-hpd-smoke="fc-dock"]'), chip: await rect(".fc-focus-chip") };
  assert.ok(onMap.bar.bottom <= onMap.dock.top + 1 && onMap.dock.top - onMap.bar.bottom < 20 && onMap.bar.left >= 0 && onMap.bar.right <= 390, `bar above the buttons: ${JSON.stringify(onMap)}`);
  assert.ok(clear(onMap.bar, onMap.chip), `the Next chip moved up, clear of the bar: ${JSON.stringify(onMap)}`);
  assert.equal(await page.locator('[data-hpd-smoke="fc-chatbar-send"]').count(), 0, "empty: no Send");
  if (shots) await page.screenshot({ path: `${shots}/chat-bar-map.png` });

  // 2. "Show me the bids in Queens": the bids open with only the 2 Queens pins, and the answer in the chat.
  await say("show me the bids in Queens");
  await waitReply(/^2 bids in Queens on the map\. First due: .*10:00 AM\. Say "next bid" to start\.$/);
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length === 2, null, { timeout: 30000 });
  assert.equal((await page.locator('[data-hpd-smoke="fc-bids-boro"]').innerText()).trim(), "📍 Queens ✕");
  const banner = await page.locator('[data-hpd-smoke="fc-bids-banner"]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  assert.ok(banner, "the bids' top bar still fits with the Queens chip");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 3. Over the bids: the bar between the list's bar and the buttons, nothing overlapping.
  await bar.waitFor();
  const onBids = { bar: await rect('[data-hpd-smoke="fc-chatbar"]'), dock: await rect('[data-hpd-smoke="fc-dock"]'), list: await rect('[data-hpd-smoke="fc-bids-list"]') };
  assert.ok(onBids.list.bottom <= onBids.bar.top + 1 && onBids.bar.bottom <= onBids.dock.top + 1, `list, bar, buttons stacked: ${JSON.stringify(onBids)}`);
  if (shots) await page.screenshot({ path: `${shots}/chat-bar-bids.png` });

  // 4. "Next bid": the first Queens bid by deadline (10 AM) opens; the chat says where it is and how many are left.
  await say("next bid");
  await page.locator('[data-hpd-smoke="fc-bid-sheet"]', { hasText: bids[1].omo }).waitFor();
  await waitReply(new RegExp(`^${bids[1].omo} in Queens, .*Due .*10:00 AM\\. 1 more after this one\\.`));
  assert.ok(!(await bar.isVisible()), "the bar steps aside while the bid is open");
  // The bid's own "Next ▶" stays in Queens too.
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-next"]').getAttribute("aria-label"), `Next bid: ${bids[0].omo} (1 left)`);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-bid-to-map"]').click();
  // 📍 Queens ✕ shows every borough again.
  await page.locator('[data-hpd-smoke="fc-bids-boro"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length === 3, null, { timeout: 30000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-boro"]').count(), 0);
  // A borough with none: said so, the map unchanged.
  await say("bids in Staten Island");
  await waitReply(/^No open bids in Staten Island\. The map shows all of them\.$/);
  assert.equal(await page.locator(".fc-bid-pin").count(), 3);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 5. "Where's my 3 PM": the bids close, the job with the 3 PM appointment opens on the map, with Waze / Google.
  await say("where's my 3 PM");
  await waitReply(/^\w{3} \d\d\/\d\d · 3–4 PM: .+ \(EQ15239\), confirmed\. It's on the map\.$/);
  assert.equal(await page.locator(".fc-bid-pin").count(), 0, "the bids closed");
  assert.ok(await page.locator("main.fc-has-job").count(), "the job card is open");
  assert.deepEqual(await page.locator('[data-hpd-smoke="fc-agent-action"]').allInnerTexts(), ["Waze", "Google Maps"]);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 6. Today's conversation stays on the phone: after a reload, the earlier turns are there (▲ Earlier today for more).
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-chat-day") || "{}").turns?.map((t) => t.heard) || []);
  assert.deepEqual(kept, ["show me the bids in Queens", "next bid", "bids in Staten Island", "where's my 3 PM"]);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // "Next appointment" only finds the 3 PM one before 3 PM (New York); later in the day ask for it by its time.
  const nyHour = Number(new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  await say(nyHour < 15 ? "where's my next appointment" : "where's my 3 PM");
  await waitReply(/\(EQ15239\), confirmed\. It's on the map\.$/);
  // Over a job card the panel stays small; back on the map the earlier turns show.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('[data-hpd-smoke="fc-close-job"], .fc-sheet-close, [aria-label="Close job"]'); if (b) b.click(); });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-chat-day") || "{}").turns?.length), 5);
  assert.deepEqual(errors, []);
  console.log(`PASS the chat on the map: a bar above the buttons (Next chip moved up; over the bids between the list and the buttons); "show me the bids in Queens" -> 2 pins + 📍 Queens chip (clears to 3); "next bid" -> ${bids[1].omo} (10 AM) with 1 more; Staten Island: none, said so; "where's my 3 PM" -> EQ15239 on the map with Waze / Google; today's 5 turns kept after a reload`);
} finally {
  await browser.close();
}
