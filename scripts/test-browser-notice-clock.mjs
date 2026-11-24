// ⏱ Notices open on the map (owner, 20 Nov: "24 hr and 72 hr on top; when I click I want a map view; on the map the time
// remaining, especially 24 hr, even if they are past due; I do not like the vendor board"), at iPhone size. One notice
// email for two jobs (like Lewis's lists): a 24-hour one already late and a 72-hour one with time left. Tapping Notices
// shows the map (no board), the pins say "⏱ 24h · … late" / "⏱ 72h · … left", the list at the bottom starts with the
// most urgent, and ⏱ 24 / 72 h is the first pick.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// A fixed Wednesday 3 PM (New York) for the page and the emails: HPD's deadlines skip weekends, so with the real clock
// these tests passed or failed by the day of the week (23 Nov: a Monday morning made the "late" notice not late yet).
const NOW = Date.parse("2026-11-25T20:00:00Z");
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.clock.setFixedTime(NOW);
  const LATE = "ER02330";
  const LEFT = "EQ15239";
  const SOON = "ER00322"; // a 24-hour notice from an hour ago: time left, so it goes first (23 Nov)
  const text = `Kindly see attached.\n\nOMO#${LATE}- 24 HR POOR PERFORMANCE NOTICE\nOMO#${LEFT}-72 HR POOR PERFORMANCE NOTICE\n\nTest Tracker\ntest.tracker@hpd.nyc.gov`;
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-list", subject: "24 HR & 72 HR POOR PERFORMANCE NOTICES", omos: [LATE, LEFT], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: ago(80), waiting: true,
      messages: [{ at: ago(80), from: "Test Tracker <test.tracker@hpd.nyc.gov>", hpd: true, mine: false, subject: "24 HR & 72 HR POOR PERFORMANCE NOTICES", text, files: [] }] },
    { id: "t-soon", subject: `OMO#${SOON} 24 HR POOR PERFORMANCE NOTICE`, omos: [SOON], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: ago(1), waiting: true,
      messages: [{ at: ago(1), from: "Test Tracker <test.tracker@hpd.nyc.gov>", hpd: true, mine: false, subject: `OMO#${SOON} 24 HR POOR PERFORMANCE NOTICE`, text: "Kindly see attached.\n\nTest Tracker", files: [] }] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').first().click();

  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const bar = page.locator('[data-hpd-smoke="fc-notice-chooser"]');
  await bar.waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-board"]').count(), 0, "Notices opens the map, not the vendor board");
  assert.match(await page.locator('[data-hpd-smoke="fc-notice-chooser-title"]').innerText(), /⏱ 24 \/ 72 h/);

  // The pins: the time on each, the late 24-hour one too (Wednesday-style list 80 h ago: 24 h is past, 72 weekday hours may not be).
  await page.waitForFunction(() => [...document.querySelectorAll(".fc-glow-tag")].some((t) => /⏱ 24h · .+ late/.test(t.textContent || "")), null, { timeout: 20000 });
  const tags = await page.locator(".fc-glow-tag").allInnerTexts();
  assert.ok(tags.some((t) => /⏱ 24h · .+ late/.test(t)), `24-hour pin says how late: ${tags.join(" | ")}`);
  assert.ok(tags.some((t) => /⏱ 72h · .+ (left|late)/.test(t)), `72-hour pin has its time: ${tags.join(" | ")}`);
  assert.ok(tags.every((t) => /^⏱ (24|72)h · /.test(t)), `only the 24 / 72-hour notices are lit: ${tags.join(" | ")}`);

  // The list at the bottom: time left first (soonest first), then the late ones (23 Nov).
  const tray = page.locator('[data-hpd-smoke="fc-notice-tray"]');
  await tray.waitFor({ timeout: 10000 });
  assert.match(await tray.locator('[data-hpd-smoke="fc-notice-tray-toggle"]').innerText(), new RegExp(`⏱ \\d+ due soon · \\d+ late · next: (${SOON}|${LEFT}) (24|72)h .+ left`));
  const head = await tray.locator('[data-hpd-smoke="fc-notice-tray-toggle"] b').evaluate((e) => ({ one: getComputedStyle(e).whiteSpace === "nowrap", h: e.getBoundingClientRect().height }));
  assert.ok(head.one && head.h < 30, `the top line stays on one line: ${JSON.stringify(head)}`);
  const gap = await page.evaluate(() => { const t = document.querySelector('[data-hpd-smoke="fc-notice-tray-toggle"]').getBoundingClientRect(); const c = document.querySelector('[data-hpd-smoke="fc-notice-chooser"]').getBoundingClientRect(); return { trayBottom: t.bottom, chooserTop: c.top }; });
  assert.ok(gap.trayBottom <= gap.chooserTop + 1, `the red notices bar sits above the black 24 / 72 h bar, not on it (24 Nov): ${JSON.stringify(gap)}`);
  await tray.locator('[data-hpd-smoke="fc-notice-tray-toggle"]').click();
  const rows = tray.locator('[data-hpd-smoke="fc-notice-tray-row"]');
  assert.ok([SOON, LEFT].includes(await rows.first().getAttribute("data-omo")), "one that can still be answered on time on top");
  assert.match(await rows.first().locator("small").innerText(), /⏱ (24|72)h · .+ left · Test/);
  assert.equal(await rows.first().locator("small.is-late").count(), 0);
  const order = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  assert.equal(order.indexOf(LATE), 2, `late ones after the two with time left: ${order.join(", ")}`);
  assert.ok(order.indexOf(LATE) > 0, `late ones after the ones with time left: ${order.join(", ")}`);
  const lateRow = rows.nth(order.indexOf(LATE));
  assert.match(await lateRow.locator("small").innerText(), /⏱ 24h · .+ late · Test/);
  assert.equal(await lateRow.locator("small.is-late").count(), 1, "late in red");
  await tray.locator('[data-hpd-smoke="fc-notice-tray-toggle"]').click();

  // The other picks and the board are one tap away; ⏱ 24 / 72 h is the first pick.
  await page.locator('[data-hpd-smoke="fc-notice-change"]').click();
  const picks = page.locator('[data-hpd-smoke="fc-notice-chooser"] .fc-notice-pick');
  assert.equal(await picks.first().getAttribute("data-hpd-smoke"), "fc-notice-pick-clock");
  assert.match(await picks.first().innerText(), /24 \/ 72 h/);
  // 24 hour and 72 hour are picks of their own (owner, 20 Nov), each with only its own jobs, and nothing overlaps in the menu.
  await page.locator('[data-hpd-smoke="fc-notice-pick-h24"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-notice-chooser-title"]').innerText(), /24 hour · 2/); // the late one and the new one
  await page.locator('[data-hpd-smoke="fc-notice-change"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-pick-h72"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-notice-chooser-title"]').innerText(), /72 hour · 1/);
  await page.locator('[data-hpd-smoke="fc-notice-change"]').click();
  const boxes = await page.locator('[data-hpd-smoke="fc-notice-chooser"] .fc-notice-pick').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, `menu picks ${i} and ${j} overlap`);
  }
  assert.ok(await page.locator('[data-hpd-smoke="fc-notice-board-open"]').isVisible(), "the board is still there");
  assert.deepEqual(errors, []);
  console.log(`PASS notices open on the map: ${LATE} "⏱ 24h · … late", ${LEFT} 72h with its time, the list starts with the most urgent (red when late), ⏱ 24 / 72 h is the first pick, no board`);
} finally {
  await browser.close();
}
