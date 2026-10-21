// A ring for every notification (owner, 20 Oct: "ring for all notifications, including when they reply back"): with the
// app open on the map, a reply from HPD (Gafur on EP27382), a new invitation to bid and a 24-hour notice under 6 hours each
// show the banner and play their own tone (seen here as the phone's vibration pattern); the first look at the app only
// remembers what's there; each rings once. Real data plus one fake reply / invitation / notice; a fast clock.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  let stage = 0; // 0: as it is; 1: Gafur replied; 2: + a new invitation; 3: + a 24-hour notice with 4 hours left
  const t0 = Date.parse("2026-10-20T15:00:00Z");
  await routePrivate(context, {
    conversations: (d) => {
      const threads = [...d.threads];
      if (stage >= 1) threads.push({ id: "test-gafur", subject: "RE: [EXTERNAL] Re: OMO No: EP27382 Boro: Brooklyn", omos: ["EP27382"], kind: "missing docs", people: ["Deoranie Gafur"], count: 1, lastAt: new Date(t0 + 4 * 60000).toISOString(), waiting: true, messages: [{ at: new Date(t0 + 4 * 60000).toISOString(), from: "Deoranie Gafur", hpd: true, mine: false, subject: "RE: OMO EP27382", text: "Kindly confirm the date as to when job was completed.", files: [] }] });
      if (stage >= 3) threads.push({ id: "test-24", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99997", omos: ["EQ99997"], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: "2026-10-19T17:00:00Z", waiting: true, messages: [{ at: "2026-10-19T17:00:00Z", from: "test@hpd.nyc.gov", hpd: true, mine: false, subject: "24 HR", text: "Notice test@hpd.nyc.gov", files: [] }] });
      return { ...d, generatedAt: `2026-10-20T15:0${stage}:00Z`, threads };
    },
  });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const tomorrow = "2026-10-21";
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [...fetched.bids, ...(stage >= 2 ? [{ ...fetched.bids[0], omo: "EX99999", address: "1 TEST PLACE", bidDue: tomorrow, bidDueTime: "11:00 AM" }] : [])] } }));
  await context.addInitScript(() => { window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(JSON.stringify(p)); return true; }; });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(t0) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').waitFor();
  await page.clock.runFor(4000);
  const ping = page.locator('[data-hpd-smoke="fc-hpd-ping"]');
  assert.equal(await ping.count(), 0, "the first look only remembers what's there");
  const vib = () => page.evaluate(() => window.__vib.slice());
  const wait = async (re) => { for (let i = 0; i < 40; i++) { if (await ping.count() && re.test(await ping.innerText())) return; await page.clock.runFor(15000); } throw new Error(`no banner ${re}: ${await ping.innerText().catch(() => "none")}`); };
  // 1. Gafur replies.
  stage = 1;
  await page.clock.runFor(5 * 60 * 1000 + 2000);
  await wait(/📋 Deoranie Gafur sent a request · EP27382/);
  assert.equal(await ping.getAttribute("data-kind"), "request", "Gafur's email is a 📋 request (its own alert)");
  assert.ok((await vib()).includes("[80,60,80]"), "the request tone rang");
  if (shots) await page.screenshot({ path: `${shots}/ring-1-reply.png` });
  await ping.locator('button[aria-label="Close"]').click();
  // 2. A new invitation to bid.
  stage = 2;
  const before = (await vib()).length;
  await page.clock.runFor(5 * 60 * 1000 + 2000);
  await wait(/New invitation to bid · EX99999/);
  assert.equal(await ping.getAttribute("data-kind"), "bid");
  assert.ok((await vib()).length > before, "rang");
  if (shots) await page.screenshot({ path: `${shots}/ring-2-invite.png` });
  await ping.locator(".fc-hpd-ping-main").click();
  await page.locator('[data-hpd-smoke="fc-bids-list"], .fc-bids-list').first().waitFor({ timeout: 20000 });
  // 3. A 24-hour notice with under 6 hours left (Monday 1 PM notice, due Tuesday 1 PM; now Tuesday ~11 AM).
  stage = 3;
  await page.clock.runFor(5 * 60 * 1000 + 2000);
  await wait(/EQ99997: \d+ h left on the notice|24-hour notice · EQ99997/);
  // The new 24-hour notice alerts as a ⏱ notice, then (under 6 h) as a ⏰ deadline.
  await wait(/EQ99997: \d+ h left on the notice/);
  assert.equal(await ping.getAttribute("data-kind"), "urgent");
  assert.ok((await vib()).includes("[120,60,120,60,120]"), "urgent ring");
  if (shots) await page.screenshot({ path: `${shots}/ring-3-urgent.png` });
  await ping.locator('button[aria-label="Close"]').click();
  // Each rings once: nothing new -> no banner again.
  const n = (await vib()).length;
  await page.clock.runFor(6 * 60 * 1000);
  assert.equal(await ping.count(), 0, "no repeat");
  assert.equal((await vib()).length, n, "no repeat ring");
  // Every alert is kept in 🔔 Notifications (20 Oct: "keep track of all"): 3 new, by kind; tap -> there + read; ✓ handled.
  // On the bids screen (opened from the invitation alert) the bell is in its header; back on the map, next to Filters.
  const bell = page.locator('[data-hpd-smoke="fc-bids-notif"]');
  await bell.waitFor();
  const n0 = Number(await bell.locator("b").innerText());
  assert.ok(n0 >= 4, `unread ${n0}`);
  await bell.click();
  const panel = page.locator('[data-hpd-smoke="fc-notif"]');
  const rows = panel.locator('[data-hpd-smoke="fc-notif-row"]');
  const kinds = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  for (const k of ["urgent", "notice", "bid", "request"]) assert.ok(kinds.includes(k), `${k} kept: ${kinds}`);
  assert.ok(kinds.indexOf("urgent") < kinds.indexOf("bid") && kinds.indexOf("bid") < kinds.indexOf("request"), "newest first");
  assert.match(await rows.filter({ hasText: "EP27382" }).first().innerText(), /Documents request[\s\S]*Deoranie Gafur sent a request · EP27382/);
  assert.match(await panel.locator('[data-hpd-smoke="fc-notif-tab-request"]').innerText(), /Requests \d/);
  const rowsBefore = await rows.count();
  if (shots) await page.screenshot({ path: `${shots}/ring-4-list.png` });
  await rows.filter({ hasText: "EX99999" }).locator('[data-hpd-smoke="fc-notif-done"]').click(); // the invitation: handled
  assert.equal(await rows.count(), rowsBefore - 1);
  await panel.locator('[data-hpd-smoke="fc-notif-tab-done"]').click();
  assert.equal(await rows.count(), 1);
  await panel.locator('[data-hpd-smoke="fc-notif-tab-all"]').click();
  await rows.filter({ hasText: "EP27382" }).locator(".fc-notif-main").click(); // -> the vendor tracking board
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor();
  const n1 = Number(await page.locator('[data-hpd-smoke="fc-notif-count"]').innerText());
  assert.equal(n1, n0 - 2, "the invitation (handled) and the request (opened) are no longer new");
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-notif-open"]').waitFor();
  assert.equal(Number(await page.locator('[data-hpd-smoke="fc-notif-count"]').innerText()), n1, "kept after reopening");
  assert.deepEqual(errors, []);
  console.log("PASS ring: Gafur's email on EP27382 (📋 request tone, her name), a new 24-hour notice (⏱ notice), a new invitation EX99999 (🧾 new tone, tap opens the bids), a 24-hour notice under 6 h (⏰ urgent tone); the first look only remembers; each rings once; all 3 kept in 🔔 Notifications (newest first, by kind), tap -> the board + read, ✓ handled, kept after reopening");
  await context.close();
} finally {
  await browser.close();
}
