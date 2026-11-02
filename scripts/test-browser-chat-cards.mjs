// The chat on the map, parts 3 and 4 (owner, 2 Nov: "yes go ahead with 3 and 4"), at iPhone size. Answers come with
// cards you can tap: bids (📨, your price or the best price), notices (⏰, with ✍️ Answer), jobs (🔧, with the
// appointment). The chat brings up what matters by itself, right above the bar, once each: bids due within the hour
// (▶ Start opens the next one), HPD answered a notice, an appointment soon the tenant hasn't confirmed (📱 Text).
// Speech and the status server are faked; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const nyAt = (ms) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const in30 = nyAt(Date.now() + 31 * 60000);
const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
if (nyHour >= 21 || nyHour < 1) { console.log("SKIP chat cards: run between 1 AM and 9 PM New York (bids due in 30 min / appointment in 2 h must be today)"); process.exit(0); }
const mapped = fetched.bids.filter((b) => b.itbFile && Number.isFinite(b.lat));
// One bid due in about 30 minutes (today), two tomorrow.
const bids = [
  { ...mapped[0], borough: "QN", bidDue: today, bidDueTime: `${in30.hour}:${in30.minute} ${in30.dayPeriod}` },
  { ...mapped[1], borough: "BK", bidDue: tomorrow, bidDueTime: "10:00 AM" },
  { ...mapped[2], borough: "BK", bidDue: tomorrow, bidDueTime: "11:00 AM" },
];
const iso = (ms) => new Date(ms).toISOString();
const t0 = Date.now();
// A 24-hour notice on EQ99997 (HPD, 5 h ago), our answer (3 h ago), HPD's answer back (1 h ago).
const threads = [{ id: "test-24", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99997", omos: ["EQ99997"], kind: "past due", people: ["Test Tracker"], count: 3, lastAt: iso(t0 - 3600000), waiting: true, messages: [
  { at: iso(t0 - 5 * 3600000), from: "test@hpd.nyc.gov", hpd: true, mine: false, subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99997", text: "24 HR POOR PERFORMANCE NOTICE OMO EQ99997. Please send the affidavit and invoice.", files: [] },
  { at: iso(t0 - 3 * 3600000), from: "me@unitedangel.test", hpd: false, mine: true, subject: "RE: 24 HR", text: "Attached the affidavit and invoice for EQ99997.", files: [] },
  { at: iso(t0 - 3600000), from: "test@hpd.nyc.gov", hpd: true, mine: false, subject: "RE: 24 HR", text: "Received, thank you. EQ99997", files: [] },
] }];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  // An appointment at EQ15239 in 2 hours, requested (the tenant hasn't confirmed).
  const at2 = nyAt(t0 + 120 * 60000);
  const h24 = (Number(at2.hour) % 12) + (at2.dayPeriod === "PM" ? 12 : 0);
  const start = `${String(h24).padStart(2, "0")}:${at2.minute}`, end = `${String(Math.min(23, h24 + 1)).padStart(2, "0")}:${at2.minute}`;
  await c.addInitScript(({ today, start, end }) => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ EQ15239: { Appointment: { date: today, start, end, state: "requested", contact: "Tenant", phone: "", note: "", reminder: 60 } } }));
    sessionStorage.setItem("seeded", "1");
  }, { today, start, end });
  const page = await c.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const input = page.locator('[data-hpd-smoke="fc-chatbar-input"]');
  const say = async (text) => { await input.fill(text); await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click(); };
  const waitReply = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 30000 });
  const close = () => page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  const cards = () => page.locator('[data-hpd-smoke="fc-chat-card"]').evaluateAll((els) => els.map((e) => ({ kind: e.dataset.kind, id: e.dataset.id, text: e.innerText.replace(/\s+/g, " ").trim() })));
  const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"]');
  const bar = page.locator('[data-hpd-smoke="fc-chatbar"]');

  // 1. The first nudge: the bid due in ~30 minutes, right above the bar (the Next chip steps aside).
  await nudge.waitFor();
  assert.equal(await nudge.getAttribute("data-kind"), "bids");
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /^⏰ 1 bid due in (30|31) min, 1 not priced\. Start\?$/);
  const nb = await nudge.boundingBox(), bb = await bar.boundingBox();
  assert.ok(nb.y + nb.height <= bb.y + 1 && nb.x >= 0 && nb.x + nb.width <= 390, `nudge right above the bar: ${JSON.stringify({ nb, bb })}`);
  assert.equal(await page.locator(".fc-focus-chip").count() ? await page.locator(".fc-focus-chip").isVisible() : false, false, "the Next chip steps aside");
  if (shots) await page.screenshot({ path: `${shots}/chat-nudge.png` });
  // ▶ Start: the next bid opens (the one due soonest), and the chat says so.
  await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]').click();
  await page.locator('[data-hpd-smoke="fc-bid-sheet"]', { hasText: bids[0].omo }).waitFor();
  await waitReply(new RegExp(`^${bids[0].omo} in Queens`));
  assert.deepEqual(await cards(), [], "no card for the bid that just opened");
  await close();
  await page.locator('[data-hpd-smoke="fc-bids-close"]').click();

  // 2. Next nudge: HPD answered on EQ99997 -> Open shows the notice. Then the unconfirmed appointment: 📱 Text is a
  // text to the tenant (opens Messages, nothing sent by the app); ✕ puts it away.
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-chat-nudge"]')?.getAttribute("data-kind") === "hpd");
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /^📬 HPD answered on EQ99997/);
  await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-chat-nudge"]')?.getAttribute("data-kind") === "appt");
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /^❔ Your \d{1,2}(:\d\d)? ?[AP]?M? at .+ hasn't confirmed\. Text them\?$/);
  assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]').getAttribute("href"), /^sms:/);
  await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click();
  assert.equal(await nudge.count(), 0, "nothing else to bring up");
  // Once each: not again after a reload.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await bar.waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await nudge.count(), 0, "the nudges closed stay closed");

  // 3. Cards. "Read me the bids": a 📨 card for each open bid; 💰 Price opens that bid.
  await say("read me the new bids");
  await waitReply(/^You have 3 open invitations to bid\./);
  const bidCards = await cards();
  assert.deepEqual(bidCards.map((x) => x.kind + x.id), bids.map((b) => `bid${b.omo}`));
  assert.match(bidCards[1].text, /^📨 Brooklyn · .+ due \w{3} 10:00 AM 💰 Price$/);
  if (shots) await page.screenshot({ path: `${shots}/chat-cards-bids.png` });
  await page.locator(`[data-hpd-smoke="fc-chat-card"][data-id="${bids[2].omo}"] [data-hpd-smoke="fc-chat-card-price"]`).click();
  await page.locator('[data-hpd-smoke="fc-bid-sheet"]', { hasText: bids[2].omo }).waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').count(), 0, "the chat closes for the bid");
  await page.locator('[data-hpd-smoke="fc-bid-to-map"]').click();
  // "Bids in Brooklyn" from the bids: a card each.
  await say("bids in Brooklyn");
  await waitReply(/^2 bids in Brooklyn on the map/);
  assert.deepEqual((await cards()).map((x) => x.id), [bids[1].omo, bids[2].omo]);
  await close();
  await page.locator('[data-hpd-smoke="fc-bids-close"]').click();

  // "Which notices are open": a ⏰ card with ✍️ Answer, which asks to answer that notice.
  await say("which notices are open");
  await waitReply(/notices? waiting on you/);
  const notice = (await cards()).find((x) => x.id === "EQ99997");
  assert.ok(notice && notice.kind === "notice" && /HPD answered/.test(notice.text) && /✍️ Answer$/.test(notice.text), JSON.stringify(notice));
  await page.locator('[data-hpd-smoke="fc-chat-card"][data-id="EQ99997"] [data-hpd-smoke="fc-chat-card-answer"]').click();
  await page.waitForFunction(() => /answer the notice for EQ99997/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""));
  await close();
  await page.keyboard.press("Escape").catch(() => {});
  await page.evaluate(() => document.querySelector('[data-hpd-smoke="fc-board-close"]')?.click());

  // "What appointments do I have today": a 🔧 card for EQ15239 with its time; tapping it opens the job.
  await bar.waitFor();
  await say("what appointments do I have today");
  await waitReply(/^1 appointment today/);
  const job = (await cards()).find((x) => x.id === "EQ15239");
  assert.ok(job && job.kind === "job" && /^🔧 .+ EQ15239 .*📅 \d/.test(job.text), JSON.stringify(job));
  await page.locator('[data-hpd-smoke="fc-chat-card"][data-id="EQ15239"] .fc-chat-card-main').click();
  await page.waitForFunction(() => document.querySelector("main.fc-has-job"));
  assert.deepEqual(errors, []);
  console.log(`PASS chat cards and nudges: ⏰ "1 bid due in ~30 min, 1 not priced. Start?" above the bar -> ▶ Start opened ${bids[0].omo}; 📬 HPD answered on EQ99997; ❔ unconfirmed appointment -> 📱 Text (sms:); closed ones stay closed after a reload; bid cards (3, 💰 Price opens the bid; Brooklyn: 2), notice card with ✍️ Answer, job card with its appointment opens the job`);
} finally {
  await browser.close();
}
