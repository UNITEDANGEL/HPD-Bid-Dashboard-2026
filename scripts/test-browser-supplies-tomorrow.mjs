// 🧰 Supplies for tomorrow (owner's idea, 14 Nov: "one list of what to bring for tomorrow's jobs, built from each job's
// work description") at iPhone size, Monday 6 PM New York: a door job and a plumbing job booked for Tuesday ->
// 1) the 6 PM "🗺 Tomorrow" note ends with "🧰 Bring: door hardware / locks, plumbing parts" and its button opens the list;
// 2) "supplies for tomorrow" typed in the chat gives the same list (store order, ticks); 3) nothing booked -> says so.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const tomorrow = "2026-11-10";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.route(/overpass|nominatim/, (r) => r.fulfill({ json: { elements: [] } }));
  await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date("2026-11-09T23:00:00Z") });
  const load = async () => {
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  };
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await load();
  const ask = async (q) => {
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(q);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    await page.waitForFunction(() => /\S/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
    await page.clock.runFor(500);
    return page.locator('[data-hpd-smoke="fc-agent-reply"]').textContent();
  };

  // 3) Nothing booked for tomorrow yet.
  assert.match(await ask("what do I need to bring tomorrow"), /Nothing is booked for tomorrow/);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // A door job and a plumbing job (read on their cards), booked for tomorrow.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let door = "", leak = "";
  for (const id of ids.slice(0, 40)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.clock.runFor(400);
    const t = await page.locator("#fc-job-card").textContent();
    const isDoor = /\b(door|doors|knob|hinge|lock|locks|cylinder|deadbolt)\b/i.test(t);
    const isLeak = /\b(faucet|sink|toilet|leak|leaking|pipe|plumbing|drain|shower|tub|bathtub)\b/i.test(t);
    if (!door && isDoor && !isLeak) door = id; else if (!leak && isLeak && !isDoor) leak = id;
    await page.locator(".fc-job-sheet-close").click();
    if (door && leak) break;
  }
  assert.ok(door && leak, "a door job and a plumbing job");
  await page.evaluate(({ door, leak, tomorrow }) => {
    const appt = (start) => ({ Appointment: { date: tomorrow, start, end: start.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, "0")), state: "confirmed", contact: "Tenant", phone: "", note: "", reminder: 60 } });
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [door]: appt("09:00"), [leak]: appt("11:00") }));
    localStorage.setItem("hpd-nudges-seen", "[]");
  }, { door, leak, tomorrow });
  await page.reload({ waitUntil: "load" });
  await load();

  // 1) The 6 PM note names what to bring; its button opens the list.
  let text = "";
  for (let i = 0; i < 14; i++) {
    await page.clock.runFor(1500);
    const n = page.locator(".fc-chat-nudge");
    if (!(await n.count())) continue;
    if ((await n.getAttribute("data-kind")) === "route") { text = await n.textContent(); break; }
    await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click();
  }
  assert.match(text, /🗺 Tomorrow: 2 stops\..*🧰 Bring: .*door hardware \/ locks/, text);
  assert.match(text, /plumbing parts/);
  await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]', { hasText: "🧰 What to bring" }).click();
  await page.locator('[data-hpd-smoke="fc-shop"]').waitFor({ timeout: 10000 });
  const reply = await page.locator('[data-hpd-smoke="fc-agent-reply"]').textContent();
  assert.match(reply, /📦 To bring for your 2 jobs tomorrow/);
  assert.match(reply, /Door hardware \/ locks \(1 job\)/);
  assert.match(reply, /Plumbing parts \(1 job\)/);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 2) Asked in the chat: the same list.
  assert.match(await ask("supplies for tomorrow"), /📦 To bring for your 2 jobs tomorrow/);
  assert.ok(await page.locator('[data-hpd-smoke="fc-shop"]').count(), "the list with ticks");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  // Today's list is unchanged (no route planned today -> plan first).
  assert.match(await ask("what do I need to bring"), /Plan today's route first/);

  assert.deepEqual(errors, []);
  console.log(`PASS supplies for tomorrow: the 6 PM note says what to bring (door hardware, plumbing parts for ${door} and ${leak}) and opens the list; "supplies for tomorrow" in the chat gives the same list; nothing booked = says so; today's list unchanged`);
} finally {
  await browser.close();
}
