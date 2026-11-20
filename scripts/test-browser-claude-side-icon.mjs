// One Claude only (owner, 20 Nov): no Claude on the map; tapping the middle Claude opens Ask for a change, cursor in the box.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.addInitScript(() => { try { localStorage.setItem("hpd-test-claude-icon", "1"); localStorage.setItem("hpd-side-open", "1"); localStorage.setItem("hpd-test-one-claude", "1"); } catch { /* */ } });
  const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
  const overrides = {
    "CLAUDE-HEARTBEAT": { at: ago(120), every: 9 },
    "CLAUDE-NOW": { at: ago(8), text: "Making the change", task: "Test task", state: "working", log: [{ at: ago(8), text: "Making the change" }] },
    // Two tasks today: one done (100%), one half done (2 of 4 steps) -> 75% on the middle Claude.
    "CHANGE-REQUEST-20990101000001": { at: ago(3600), text: "Test task one" },
    "CHANGE-REPLY-20990101000001": { status: "Done", steps: [{ text: "a", done: true }], updates: [{ at: ago(3000), text: "done" }] },
    "CHANGE-REQUEST-20990101000002": { at: ago(600), text: "Test task two" },
    "CHANGE-REPLY-20990101000002": { status: "Working on it", workingAt: ago(30), steps: [{ text: "a", done: true }, { text: "b", done: true }, { text: "c", done: false }, { text: "d", done: false }], updates: [{ at: ago(60), text: "working" }] },
  };
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // One Claude only (owner, 20 Nov): nothing of Claude on the map, just the middle button.
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-hpd-smoke="fc-claude-side-icon"]').count(), 0, "no second Claude at the side");
  assert.equal(await page.locator('[data-hpd-smoke="fc-claude-live"]').count(), 0, "no Claude strip on the map");
  const orb = page.locator('[data-hpd-smoke="fc-claude-orb"]');
  assert.equal(await page.locator('[data-hpd-smoke="fc-chatbar"]').count(), 0, "no second Claude text bar at the bottom");
  assert.equal(await page.locator('[data-hpd-smoke="fc-orb-say"]').count(), 0, "no bubble pops up by itself");
  assert.equal(await orb.count(), 1, "one Claude button");
  assert.equal(await orb.getAttribute("data-mode"), "working", "the middle Claude shows it is working");
  // The % of Claude's tasks sits on the middle button; tap = the small list, tap again = closed.
  const pct = page.locator('[data-hpd-smoke="fc-claude-pct"]');
  await pct.waitFor({ state: "visible", timeout: 30000 });
  assert.match(await pct.innerText(), /^75%/, "two tasks: 100% and 50% -> 75%");
  await pct.click();
  const tasks = page.locator('[data-hpd-smoke="fc-claude-tasks"]');
  await tasks.waitFor({ state: "visible" });
  assert.match(await tasks.innerText(), /1 of 2 done/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-claude-task"]').count(), 2);
  const bx = await tasks.boundingBox();
  assert.ok(bx && bx.x >= 0 && bx.x + bx.width <= 390 && bx.y >= 0, "the list fits on the iPhone screen");
  await pct.click();
  assert.equal(await tasks.count(), 0, "tap again closes it");
  await pct.click();
  await page.locator('[data-hpd-smoke="fc-claude-tasks-ask"]').click();
  assert.equal(await tasks.count(), 0, "a tap inside closes it");
  await page.locator('[data-hpd-smoke="fc-ask-change-text"]').waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // Tap Claude: Ask for a change opens with the cursor in the box.
  await orb.click();
  const box = page.locator('[data-hpd-smoke="fc-ask-change-text"]');
  await box.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-hpd-smoke") === "fc-ask-change-text", null, { timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-type-input"]').count(), 0, "not the AI chat");
  assert.deepEqual(errors, []);
  console.log("PASS one Claude: % of tasks on the middle button opens / closes the list, no side icon, strip, bottom text bar or pop-up bubble, tapping Claude opens Ask for a change with the cursor in the box");
} finally {
  await browser.close();
}
