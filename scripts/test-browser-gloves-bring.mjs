// 🔘 Big buttons with gloves on + 🧰 Did you bring everything? (idea list). Monday 9 AM New York, a planned route with a
// door job and a plumbing job, no "I'm here" yet -> the note "🧰 Before you go: today's 2 stops need …. All in the
// truck?"; 📦 The list opens the shopping list. All -> Big buttons (gloves) makes every button 56 px+, remembered.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const today = "2026-11-09";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.route(/overpass|nominatim/, (r) => r.fulfill({ json: { elements: [] } }));
  await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date("2026-11-09T14:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  // Two open jobs: one whose work mentions a door, one a leak (read on their cards).
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
  await page.evaluate(({ ids, today }) => {
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "09:00", end: "17:00", minutes: 45, borough: "ALL" }, ids, origin: null }));
    localStorage.setItem("hpd-nudges-seen", "[]");
  }, { ids: [door, leak], today });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // Close other notes until ours shows.
  let text = "";
  for (let i = 0; i < 12; i++) {
    await page.clock.runFor(1500);
    const n = page.locator('.fc-chat-nudge');
    if (!(await n.count())) continue;
    if ((await n.getAttribute("data-kind")) === "bring") { text = await n.textContent(); break; }
    await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click();
  }
  assert.match(text, /🧰 Before you go: today's 2 stops need .*door hardware \/ locks.*All in the truck\?/, text);
  assert.match(text, /plumbing parts/);
  await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]', { hasText: "📦 The list" }).click();
  await page.locator('[data-hpd-smoke="fc-shop"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').textContent(), /📦 To bring for your 2 stops today/);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 🧤 Big buttons.
  const h0 = await page.locator('[data-hpd-smoke="fc-more-open"]').evaluate((b) => b.getBoundingClientRect().height);
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  const row = page.locator('[data-hpd-smoke="fc-more-sheet"] button', { hasText: "Big buttons (gloves)" });
  assert.match(await row.textContent(), /Off · makes every button bigger/);
  await row.click();
  assert.match(await row.textContent(), /On: every button bigger for work gloves/);
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-gloves")), "1");
  assert.ok(await page.locator("main.fc-gloves").count());
  const small = await page.locator('main.fc-gloves button:visible').evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 && (r.height < 55.5 || r.width < 55.5)).length);
  const which = await page.locator("main.fc-gloves button:visible").evaluateAll((bs) => bs.filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 55.5 || r.width < 55.5); }).map((b) => `${b.className}|${b.getAttribute("data-hpd-smoke")}|${(b.textContent||"").slice(0,20)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}|${getComputedStyle(b).minHeight}`));
  assert.equal(small, 0, which.join(" ; "));
  await page.screenshot({ path: `${process.env.TEMP || "/tmp"}/gloves.png` });
  await page.locator(".fc-more-scrim").click({ position: { x: 10, y: 10 } });
  const h1 = await page.locator('[data-hpd-smoke="fc-more-open"]').evaluate((b) => b.getBoundingClientRect().height);
  assert.ok(h1 >= 56 && h1 >= h0, `${h0} -> ${h1}`);
  await page.reload({ waitUntil: "load" });
  await page.locator("main.fc-gloves").waitFor({ timeout: 60000 });
  assert.deepEqual(errors, []);
  console.log("PASS gloves + bring: the morning note lists what today's stops need and opens the shopping list; Big buttons makes every button 56 px+ and is remembered");
} finally {
  await browser.close();
}
