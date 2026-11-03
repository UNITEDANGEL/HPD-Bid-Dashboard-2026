// Claude tells you when it's done or needs you (2 Nov, "keep upgrading", after "a real live update with Claude all the
// time so I can do the upgrade easily from my app") at iPhone size. Status server faked.
// 1) App open, Claude working: the request turns Done with a note -> the banner "✅ Claude finished your request" with
//    the note, within a few seconds, no reload. Then a question -> "❓ Claude needs your answer".
// 2) The phone alert's link (…&requests=1) opens Your requests with the request on it.
// 3) scripts/claude-alert.mjs: one alert only when the status changes to Done / Waiting for you.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { claudeAlert } from "./claude-alert.mjs";

// 3) first: no browser needed.
assert.equal(claudeAlert("Working on it", { status: "Working on it", updates: [] }, "x"), null);
assert.equal(claudeAlert("Done", { status: "Done", updates: [{ at: "", text: "again" }] }, "x"), null, "already done: no second alert");
const a1 = claudeAlert("Working on it", { status: "Done", updates: [{ at: "", text: "Built it.\nDetails" }] }, "(from the chat) make the pins bigger");
assert.deepEqual(a1, { title: "✅ Claude finished your request", body: "“make the pins bigger” Built it.", url: "/map/?view=all&map=1&requests=1" });
assert.match(claudeAlert(undefined, { status: "Waiting for you", updates: [] }, "which color?").title, /needs your answer/);

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const id = "20261102200000";
const overrides = {
  "CLAUDE-HEARTBEAT": { at: ago(2), every: 9 },
  [`CHANGE-REQUEST-${id}`]: { at: ago(10), text: "Make the pins bigger" },
  [`CHANGE-REPLY-${id}`]: { status: "Working on it", workingAt: ago(1), updates: [{ at: ago(8), text: "Got it." }], steps: [{ text: "Build", done: true }, { text: "Test", done: false }] },
};
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") return r.fulfill({ json: { ok: true } });
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-claude-live"]').waitFor({ timeout: 20000 });

  // 1) Done while the app is open.
  overrides[`CHANGE-REPLY-${id}`] = { status: "Done", workingAt: "", now: null, updates: [...overrides[`CHANGE-REPLY-${id}`].updates, { at: new Date().toISOString(), text: "The pins are bigger now. Pull down to update." }], steps: [{ text: "Build", done: true }, { text: "Test", done: true }] };
  const t0 = Date.now();
  await page.waitForFunction(() => /Claude finished your request/.test(document.querySelector('[data-hpd-smoke="fc-hpd-ping"]')?.textContent || ""), null, { timeout: 12000 });
  const lag = Date.now() - t0;
  assert.match(await page.locator('[data-hpd-smoke="fc-hpd-ping"]').innerText(), /pins are bigger now/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/claude-done.png` }).catch(() => {});

  // 2) The alert's link opens Your requests.
  await page.goto(`${baseUrl}/map/?view=all&map=1&requests=1`, { waitUntil: "load", timeout: 180000 });
  const thread = page.locator('[data-hpd-smoke="fc-change-thread"]').first();
  await thread.waitFor({ timeout: 30000 });
  assert.match(await thread.innerText(), /Make the pins bigger/);
  assert.match(await thread.innerText(), /Done/);
  assert.ok(!/requests=1/.test(page.url()), "the link is cleaned so a reload doesn't reopen it");
  assert.deepEqual(errors, []);
  console.log(`PASS claude done: the banner "✅ Claude finished your request" ${(lag / 1000).toFixed(1)} s after it was marked Done (app open); the phone alert's link opens Your requests; one alert per change to Done / Waiting for you`);
} finally {
  await browser.close();
}
