// Claude's question in words, one tap to answer (owner, 4 Nov: "why is there a question mark next to Claude, I do not
// understand; it should auto know, I need better flow"): at iPhone size, a request waiting for the owner shows
// "1 question" on the Claude button (not a bare ❓), and the Claude card on the map says the question with
// 👍 You decide / ⏭ Skip it / ✍️ Answer. You decide saves the answer for Claude and the question goes away.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const id = "20261104120000";
const overrides = {
  "CLAUDE-HEARTBEAT": { at: ago(2), every: 9 },
  [`CHANGE-REQUEST-${id}`]: { at: ago(30), text: "(idea) Insurance and license dates: The app warns you 30 days before a paper runs out." },
  [`CHANGE-REPLY-${id}`]: { status: "Waiting for you", workingAt: "", updates: [{ at: ago(20), text: "When do your insurance and license papers run out?" }], steps: [] },
};
const posts = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const badge = page.locator('[data-hpd-smoke="fc-claude-orb-ask"]');
  await badge.waitFor({ timeout: 30000 });
  assert.equal(await badge.innerText(), "1 question");
  const card = page.locator('[data-hpd-smoke="fc-claude-live"]');
  await card.waitFor({ timeout: 30000 });
  assert.match(await card.innerText(), /Claude · has one question for you[\s\S]*When do your insurance and license papers run out\?/);
  await card.locator('[data-hpd-smoke="fc-claude-ask-decide"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-claude-orb-ask"]'), null, { timeout: 10000 });
  const a = posts.find((p) => p.key === `CHANGE-ANSWER-${id}`);
  assert.ok(a, "saved for Claude");
  assert.match(a.patch.answers[0].text, /^You decide/);
  assert.deepEqual(errors, []);
  console.log('PASS Claude asks in words: "1 question" on the button (not ❓), the card says the question with You decide / Skip it / Answer; You decide goes to Claude and the question goes away');
} finally {
  await browser.close();
}
