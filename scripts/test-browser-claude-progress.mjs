// Claude's progress on the owner's requests comes to the phone (27 Oct, "keep upgrading"): at iPhone size, a new note
// on a request (CHANGE-REPLY-… on the status server, faked here) pops up as a "🤖 Claude: …" alert; tapping it opens
// What's new with Your requests. A phone that never looked before starts from now (no replay of old notes).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const now = new Date().toISOString();
const overrides = {
  "CHANGE-REQUEST-20261027180000": { at: "2026-10-27T18:00:00.000Z", text: "make the map buttons bigger" },
  "CHANGE-REPLY-20261027180000": { status: "Working on it", updates: [{ at: "2026-10-27T18:00:30.000Z", text: "Got it" }, { at: now, text: "Bigger buttons are built; testing them now." }], steps: [{ text: "Make them bigger", done: true }, { text: "Push it live", done: false }] },
};
async function open(heard) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  if (heard !== undefined) await c.addInitScript((h) => { try { localStorage.setItem("hpd-claude-heard", h); } catch { /* */ } }, heard);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  return { c, page, errors };
}
try {
  // 1. Looked before (mark older than the new note): the alert pops up with the newest note.
  const { c, page, errors } = await open("2026-10-27T18:00:30.000Z");
  const ping = page.locator('[data-hpd-smoke="fc-hpd-ping"][data-kind="claude"]');
  // Other alerts (overdue notices in the real data) come first: Claude's waits its turn, then shows.
  for (let i = 0; i < 12 && !(await ping.count()); i++) {
    const ok = page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]');
    if (await ok.count()) await ok.click().catch(() => {});
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.waitForTimeout(1000);
  }
  await ping.waitFor({ timeout: 20000 });
  const text = await ping.innerText();
  assert.match(text, /Claude: Working on it/);
  assert.match(text, /Bigger buttons are built/);
  assert.doesNotMatch(text, /Got it/, "only the newest note");
  await ping.locator(".fc-hpd-ping-main").click();
  await page.locator('[data-hpd-smoke="fc-whatsnew"]').waitFor({ timeout: 10000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-claude-heard")), now, "remembered as heard");
  assert.deepEqual(errors, []);
  await c.close();

  // 2. Never looked on this phone: no replay of what was already there.
  const second = await open(undefined);
  await second.page.waitForTimeout(4000);
  assert.equal(await second.page.locator('[data-hpd-smoke="fc-hpd-ping"][data-kind="claude"]').count(), 0, "no old news on a new phone");
  await second.c.close();
  console.log("PASS Claude's progress: a new note on a request pops up as \"🤖 Claude: Working on it\" with the note, opens Your requests; a new phone doesn't replay old notes");
} finally {
  await browser.close();
}
