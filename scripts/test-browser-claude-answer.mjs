// Answer Claude from the app (2 Nov, "keep upgrading": a request "Waiting for you" had no way to answer it) at iPhone
// size. Status server faked (POSTs merged into it like the real one).
// 1) The phone alert's link opens Your requests: the waiting request has "❓ Claude needs your answer" and a box;
//    the answer is saved as CHANGE-ANSWER-<id> and shows as your bubble with "Your answer went to Claude".
// 2) A finished request has "↩ Not right? Tell Claude", which opens the same box.
// 3) In the chat, "tell Claude …" while Claude waits on a question = the answer; "tell Claude new request …" = a new one.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const ask = "20261102210000";
const done = "20261102200000";
const clear = "20261102193000";
const overrides = {
  "CLAUDE-HEARTBEAT": { at: ago(2), every: 9 },
  [`CHANGE-REQUEST-${ask}`]: { at: ago(30), text: "Make the bid pins a different color" },
  [`CHANGE-REPLY-${ask}`]: { status: "Waiting for you", workingAt: "", updates: [{ at: ago(20), text: "Which color do you want: blue or orange?" }], steps: [] },
  [`CHANGE-REQUEST-${done}`]: { at: ago(90), text: "Bigger text on notices" },
  [`CHANGE-REPLY-${done}`]: { status: "Done", workingAt: "", updates: [{ at: ago(60), text: "Notices use 17px now." }], steps: [{ text: "Build", done: true }], try: "/map/?view=all&map=1&bids=1" },
  [`CHANGE-REQUEST-${clear}`]: { at: ago(120), text: "Move the Clear route button up" },
  [`CHANGE-REPLY-${clear}`]: { status: "Done", workingAt: "", updates: [{ at: ago(10), text: "Clear route is at the top now." }], steps: [] },
};
const posts = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      if (b?.key && !/^(APP-ERRORS|VOICE-CHECK)/.test(b.key)) { posts.push(b); overrides[b.key] = { ...(overrides[b.key] || {}), ...b.patch }; }
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1) Answer the question.
  await page.goto(`${baseUrl}/map/?view=all&map=1&requests=1`, { waitUntil: "load", timeout: 180000 });
  const waiting = page.locator('[data-hpd-smoke="fc-change-thread"]', { hasText: "different color" });
  await waiting.waitFor({ timeout: 60000 });
  assert.match(await waiting.locator('[data-hpd-smoke="fc-change-status"]').innerText(), /❓ Claude needs your answer/);
  const send = waiting.locator('[data-hpd-smoke="fc-change-answer-send"]');
  assert.ok(await send.isDisabled(), "nothing typed: Send is off");
  await waiting.locator('[data-hpd-smoke="fc-change-answer-text"]').fill("Orange, like the notices");
  await send.click();
  await waiting.locator('[data-hpd-smoke="fc-change-yours"]').waitFor({ timeout: 10000 });
  assert.match(await waiting.locator('[data-hpd-smoke="fc-change-yours"]').innerText(), /You ·[\s\S]*Orange, like the notices/);
  await page.waitForFunction(() => /Your answer went to Claude/.test([...document.querySelectorAll('[data-hpd-smoke="fc-change-thread"]')].find((e) => /different color/.test(e.textContent))?.textContent || ""), null, { timeout: 10000 });
  const a1 = posts.find((p) => p.key === `CHANGE-ANSWER-${ask}`);
  assert.ok(a1, "saved as CHANGE-ANSWER-<id>");
  assert.equal(a1.patch.answers.length, 1);
  assert.equal(a1.patch.answers[0].text, "Orange, like the notices");
  assert.equal(await waiting.locator('[data-hpd-smoke="fc-change-answer"]').count(), 0, "answered: the box goes away");

  // 2) A finished one: "Not right? Tell Claude".
  const fin = page.locator('[data-hpd-smoke="fc-change-thread"]', { hasText: "Bigger text on notices" });
  assert.equal(await fin.locator('[data-hpd-smoke="fc-change-answer"]').count(), 0);
  // ▶ Try it opens the screen that changed; 👍 Works is saved and shown.
  assert.equal(await fin.locator('[data-hpd-smoke="fc-change-try"]').getAttribute("href"), "/map/?view=all&map=1&bids=1");
  await fin.locator('[data-hpd-smoke="fc-change-works"]').click();
  await fin.locator('[data-hpd-smoke="fc-change-ok"]').waitFor({ timeout: 5000 });
  assert.ok(posts.find((p) => p.key === `CHANGE-ANSWER-${done}`)?.patch.ok, "👍 saved as ok on CHANGE-ANSWER");
  await fin.locator('[data-hpd-smoke="fc-change-again"]').click();
  await fin.locator('[data-hpd-smoke="fc-change-answer-text"]').fill("Still too small on my iPhone");
  await fin.locator('[data-hpd-smoke="fc-change-answer-send"]').click();
  await page.waitForTimeout(800);
  const a2 = posts.filter((p) => p.key === `CHANGE-ANSWER-${done}` && p.patch.answers).pop();
  assert.equal(a2?.patch.answers[0].text, "Still too small on my iPhone");
  assert.equal(a2.patch.ok, "", "an answer after 👍 clears it");
  assert.match(await fin.locator('[data-hpd-smoke="fc-change-status"]').innerText(), /Your answer went to Claude/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/claude-answer.png` }).catch(() => {});

  // 3) The chat: Claude asks again; "tell Claude blue" answers it.
  overrides[`CHANGE-REPLY-${ask}`] = { ...overrides[`CHANGE-REPLY-${ask}`], updates: [...overrides[`CHANGE-REPLY-${ask}`].updates, { at: new Date().toISOString(), text: "Orange is taken by notices. Blue or green?" }] };
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const say = async (text) => {
    const bar = page.locator('[data-hpd-smoke="fc-chatbar-input"]');
    if (await bar.isVisible().catch(() => false)) { await bar.fill(text); await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click(); }
    else { await page.locator('[data-hpd-smoke="fc-agent-type-input"]').fill(text); await page.locator('[data-hpd-smoke="fc-agent-type-send"]').click(); }
  };
  await page.waitForTimeout(1500);
  await say("tell Claude blue please");
  await page.waitForFunction(() => /Sent to Claude as your answer on "Make the bid pins a different color"/.test(document.querySelector('[data-hpd-smoke="fc-agent"]')?.textContent || ""), null, { timeout: 15000 });
  const a3 = posts.filter((p) => p.key === `CHANGE-ANSWER-${ask}`).pop();
  assert.equal(a3.patch.answers.length, 2, "added to the earlier answer");
  assert.match(a3.patch.answers[1].text, /^Blue please$/i);
  const before = posts.filter((p) => p.key.startsWith("CHANGE-REQUEST-")).length;
  assert.equal(before, 0, "no new request for an answer");
  await say("tell Claude new request add a dark map at night");
  await page.waitForFunction(() => /Sent to Claude for the next upgrade/.test(document.querySelector('[data-hpd-smoke="fc-agent"]')?.textContent || ""), null, { timeout: 15000 });
  const req = posts.find((p) => p.key.startsWith("CHANGE-REQUEST-"));
  assert.match(req.patch.text, /^\(said to the helper\) Add a dark map at night$/);
  // "it works" checks the newest finished request (Clear route; the notices one was answered above, so it's open again).
  await say("it works");
  await page.waitForFunction(() => /👍 Told Claude "Move the Clear route button up" works/.test(document.querySelector('[data-hpd-smoke="fc-agent"]')?.textContent || ""), null, { timeout: 15000 });
  assert.ok(posts.find((p) => p.key === `CHANGE-ANSWER-${clear}`)?.patch.ok);
  assert.deepEqual(errors, []);
  console.log("PASS claude answer: ❓ waiting request answered in its box (CHANGE-ANSWER, your bubble, \"Your answer went to Claude\"); ▶ Try it link, 👍 Works saved, ↩ Not right? on a finished one; \"tell Claude blue please\" answered Claude's question in the chat; \"new request …\" made a new one; \"it works\" 👍 the newest finished one");
} finally {
  await browser.close();
}
