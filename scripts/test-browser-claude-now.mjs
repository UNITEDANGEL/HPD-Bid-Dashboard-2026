// 🤖 Claude right now (owner, 3 Nov: "I need to know every second what's going on" and "the AI button, isn't that the
// same as your chat bot?") at iPhone size, status server faked. 1) The middle button is 🤖 Claude (no second AI
// button); while Claude works it says "Working" and the map card shows the step now with its seconds counting and the
// steps just done. 2) A new step shows by itself within seconds. 3) Tapping 🤖 opens Your requests with the same live
// step. 4) Claude asks a question: the button turns ❓. 5) Claude finished: "waiting for your next message".
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const overrides = {
  "CLAUDE-HEARTBEAT": { at: ago(120), every: 9 },
  "CLAUDE-NOW": { at: ago(8), text: "Changing the screen", task: "Make the chat better", state: "working", log: [{ at: ago(200), text: "Reading the app's code" }, { at: ago(8), text: "Changing the screen" }] },
};
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 1) The button and the card.
  const orb = page.locator('[data-hpd-smoke="fc-claude-orb"]');
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-claude-orb"]')?.getAttribute("data-mode") === "working", null, { timeout: 20000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-ai-orb"]').count(), 0, "one AI: the chat bar");
  assert.match(await orb.innerText(), /Working/);
  assert.equal(await orb.locator('[data-hpd-smoke="fc-face"]').getAttribute("data-mode"), "working", "the face on the button works (head moving)");
  // One slim live line first (more room on the map); tap it for the whole card.
  const slim = page.locator('[data-hpd-smoke="fc-claude-live"][data-slim="1"]');
  await slim.waitFor({ timeout: 10000 });
  assert.match(await slim.locator('[data-hpd-smoke="fc-claude-slim-text"]').innerText(), /Changing the screen/);
  const sb = await slim.boundingBox();
  assert.ok(sb && sb.height < 70, `one slim line (${sb && Math.round(sb.height)} px)`);
  await slim.locator('[data-hpd-smoke="fc-claude-expand"]').click();
  const card = page.locator('[data-hpd-smoke="fc-claude-live"][data-kind="now"]');
  await card.waitFor({ timeout: 10000 });
  assert.match(await card.innerText(), /Make the chat better/);
  assert.equal(await card.locator('[data-hpd-smoke="fc-claude-now-text"]').innerText(), "Changing the screen");
  assert.match(await card.locator('[data-hpd-smoke="fc-claude-now-log"]').innerText(), /✓ Reading the app's code/);
  const t1 = await card.locator(".fc-claude-now-main .fc-seconds-ago").innerText();
  await page.waitForTimeout(2100);
  const t2 = await card.locator(".fc-claude-now-main .fc-seconds-ago").innerText();
  assert.notEqual(t1, t2, `the seconds count (${t1} -> ${t2})`);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/claude-now.png` }).catch(() => {});

  // 2) A new step comes in by itself.
  overrides["CLAUDE-NOW"] = { ...overrides["CLAUDE-NOW"], at: ago(0), text: "Testing on my computer", log: [...overrides["CLAUDE-NOW"].log, { at: ago(0), text: "Testing on my computer" }] };
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-claude-now-text"]')?.textContent === "Testing on my computer", null, { timeout: 12000 });

  // 3) 🤖 grows into the talking helper (face at the top); 📋 in it opens Your requests with the live step.
  await orb.click();
  const helper = page.locator('[data-hpd-smoke="fc-agent"]');
  await helper.waitFor({ timeout: 10000 });
  assert.match(await helper.getAttribute("class"), /is-from-dock/, "it grows out of the 🤖 button");
  await helper.locator('[data-hpd-smoke="fc-agent-who"] [data-hpd-smoke="fc-face"]').waitFor();
  await page.locator('[data-hpd-smoke="fc-agent-requests"]').click();
  const box = page.locator('[data-hpd-smoke="fc-claude-now-box"]');
  await box.waitFor({ timeout: 10000 });
  assert.match(await box.innerText(), /Claude right now · Make the chat better[\s\S]*Testing on my computer/);
  await page.keyboard.press("Escape");
  await page.locator('[data-hpd-smoke="fc-whats-new-close"], [data-hpd-smoke="fc-version-close"]').first().click({ timeout: 3000 }).catch(() => {});

  // 4) A question for you: ❓.
  overrides["CHANGE-REQUEST-20261103100000"] = { at: ago(600), text: "Make the chat better" };
  overrides["CHANGE-REPLY-20261103100000"] = { status: "Waiting for you", updates: [{ at: ago(60), text: "Which one first?" }] };
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-claude-orb"]')?.getAttribute("data-mode") === "ask", null, { timeout: 15000 });
  assert.equal(await orb.locator(".fc-claude-orb-badge").innerText(), "❓");
  if (await page.locator('[data-hpd-smoke="fc-whatsnew"]').count()) await page.locator('[data-hpd-smoke="fc-whatsnew"]').getByRole("button", { name: "Close", exact: true }).first().click();
  await page.locator('[data-hpd-smoke="fc-whatsnew"]').waitFor({ state: "detached", timeout: 5000 });
  // A tap still brings the talking robot; it says Claude has a question, with a button to answer it.
  await orb.click();
  await page.waitForFunction(() => /Claude has a question for you about Make the chat better/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-action"]', { hasText: "Answer Claude" }).count(), 1);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 5) Finished.
  delete overrides["CHANGE-REQUEST-20261103100000"]; delete overrides["CHANGE-REPLY-20261103100000"];
  overrides["CLAUDE-NOW"] = { ...overrides["CLAUDE-NOW"], at: ago(0), text: "Finished for now: waiting for your next message", state: "idle" };
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-claude-orb"]')?.getAttribute("data-mode") === "on", null, { timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-claude-live"][data-kind="now"]').count(), 0, "the working card goes away");
  assert.deepEqual(errors, []);
  console.log(`PASS claude-now: 🤖 Claude in the middle (no 2nd AI button) says Working; the card shows the step now, seconds counting (${t1} -> ${t2}) and the steps done; a new step came in by itself; 🤖 opens Your requests with it; a question turns it ❓; finished -> on`);
} finally {
  await browser.close();
}
