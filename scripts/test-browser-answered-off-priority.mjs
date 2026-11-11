// 🔥 Answered = off Priority at once (plan item 15, 11 Nov: "after Send the notice is done and leaves the map / list"),
// at iPhone size: a 24 HR notice from HPD lights its job 🔥 on the map; answer it on the board (two taps; the email is
// faked, nothing leaves this test) and the job stops glowing right away, without waiting for the next Gmail read.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const OPEN = "ER02330";
  const msg = (at, subject, text) => ({ at, from: "Test Tracker <test.tracker@hpd.nyc.gov>", hpd: true, mine: false, subject, text, files: [] });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-24", subject: `24 HR POOR PERFORMANCE NOTICE- OMO#${OPEN}`, omos: [OPEN], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: ago(2), waiting: true, messages: [msg(ago(2), "24", `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${OPEN}.

Test Tracker
test.tracker@hpd.nyc.gov`)] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const sent = [];
  await c.route("**/api/drive/hpd-reply", (r) => { const b = JSON.parse(r.request().postData() || "{}"); sent.push(b); return r.fulfill({ json: { sent: true, to: b.to || "me" } }); });
  await c.route("**/api/drive/hpd-draft", (r) => { const b = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { ai: true, model: "test", text: `Hello,\n\nRe: OMO# ${b.omo}\n\nAI reply.\n\nThank you` } }); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor({ timeout: 60000 });
  const litNow = () => page.evaluate((o) => [...document.querySelectorAll(".is-glow-priority[title]")].some((e) => (e.getAttribute("title") || "").startsWith(`${o} `)), OPEN);
  await page.waitForFunction((o) => [...document.querySelectorAll(".is-glow-priority[title]")].some((e) => (e.getAttribute("title") || "").startsWith(`${o} `)), OPEN, { timeout: 20000 });
  const count0 = Number(await page.locator('[data-hpd-smoke="fc-notice-pick-priority"] em').textContent());

  // The row's big button (✉ Update …) opens its reply, written for it.
  const row = board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${OPEN}"]`).first();
  await row.waitFor({ timeout: 20000 });
  await row.locator('[data-hpd-smoke="fc-board-do-go"]').click();
  const send = row.locator('[data-hpd-smoke="fc-board-reply-send"]');
  await send.click();
  await send.click();
  await board.locator('[data-hpd-smoke="fc-board-moved"]').waitFor({ timeout: 10000 });
  assert.equal(sent.length, 1, "one email, after two taps");
  await page.waitForFunction(([n]) => Number(document.querySelector('[data-hpd-smoke="fc-notice-pick-priority"] em')?.textContent || 0) < n, [count0], { timeout: 10000 });
  await page.waitForTimeout(800);
  assert.equal(await litNow(), false, `${OPEN} no longer glows 🔥 Priority`);
  assert.deepEqual(errors, []);
  console.log(`PASS answered = off Priority: ${OPEN} lit 🔥 (Priority ${count0}) -> answered on the board (two taps) -> off the map's Priority at once (${count0} -> ${await page.locator('[data-hpd-smoke="fc-notice-pick-priority"] em').textContent()})`);
} finally {
  await browser.close();
}
