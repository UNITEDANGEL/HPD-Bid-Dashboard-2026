// "Did you mean…?" (owner, 3 Nov, pick 2 of making the chat smarter) at iPhone size, typed in the chat bar.
// 1) "wats next" (very close) runs "what's next" straight away, no AI. 2) "how is trafic" (close) offers
//    "how's the traffic" + 🤖 Ask the AI instead; tapping the choice runs it. 3) 🤖 Ask the AI instead sends the words
//    as said. 4) "what is the capital of France" (nothing close) goes to the AI as before. The AI is faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const asked = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }))); // never the real status server
  await routePrivate(c);
  await c.route(/\/api\/drive\/hpd-ask/, (r) => { asked.push(r.request().postDataJSON()?.question); return r.fulfill({ json: { ai: true, text: "Answer from the AI." } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => setTimeout(() => u.onend?.(), 30); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const say = async (text) => {
    const bar = page.locator('[data-hpd-smoke="fc-chatbar-input"]');
    if (await bar.isVisible().catch(() => false)) { await bar.fill(text); await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click(); }
    else { if (!(await page.locator('[data-hpd-smoke="fc-agent-type-input"]').count())) await page.locator('[data-hpd-smoke="fc-agent-type-btn"]').click(); await page.locator('[data-hpd-smoke="fc-agent-type-input"]').fill(text); await page.locator('[data-hpd-smoke="fc-agent-type-send"]').click(); }
  };
  const heard = () => page.locator('[data-hpd-smoke="fc-agent-heard"]').innerText();
  const reply = () => page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();

  // 1) Very close: done straight away.
  await say("wats next");
  await page.waitForFunction(() => /what's next/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""), null, { timeout: 15000 });
  await page.waitForFunction(() => /^Next: |Nothing urgent right now/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(asked.length, 0, "no AI for a misspelled command");

  // 2) Close: offered.
  await say("how is trafic");
  await page.locator('[data-hpd-smoke="fc-agent-choices"]').waitFor({ timeout: 15000 });
  assert.match(await reply(), /Did you mean one of these\?/);
  const choices = await page.locator('[data-hpd-smoke="fc-agent-choice"]').allInnerTexts();
  assert.equal(choices[0], "how's the traffic", choices.join(" | "));
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-try"]:not(.fc-agent-choices)').count(), 0, "no Try chips under the choices");
  await page.locator('[data-hpd-smoke="fc-agent-choice"]', { hasText: "how's the traffic" }).click();
  await page.waitForFunction(() => /how's the traffic/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""), null, { timeout: 15000 });
  await page.waitForFunction(() => !/Did you mean/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "") && !/^(…|Thinking)/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "…"), null, { timeout: 15000 });
  assert.equal(asked.length, 0);

  // 3) Ask the AI instead.
  await say("what did claud do");
  await page.locator('[data-hpd-smoke="fc-agent-choices"]').waitFor({ timeout: 15000 });
  await page.locator('[data-hpd-smoke="fc-agent-ask-ai"]').click();
  await page.waitForFunction(() => /Answer from the AI/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.deepEqual(asked, ["what did claud do"]);
  assert.match(await heard(), /what did claud do/);

  // 4) Nothing close: the AI, as before.
  await say("what is the capital of France");
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-agent-past"]').length >= 3 && /Answer from the AI/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "") && /capital of France/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(asked[1], "what is the capital of France");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-choices"]').count(), 0);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/did-you-mean.png` }).catch(() => {});
  assert.deepEqual(errors, []);
  console.log(`PASS did you mean: "wats next" ran what's next (no AI); "how is trafic" offered [${choices.join(", ")}] + Ask the AI, the choice ran; "what did claud do" -> Ask the AI instead sent it as said; "what is the capital of France" went to the AI`);
} finally {
  await browser.close();
}
