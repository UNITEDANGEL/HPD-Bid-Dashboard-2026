// 🗣 The helper answers in the bubble (idea list, 3 Nov: "short answers show in the bubble without opening the chat"):
// a plain one-line answer stays in the little bubble on the map (the whole answer, the face talking); a tap opens the
// chat with it; an answer with something to tap (a card, buttons) opens the chat as before.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const ask = async (text) => {
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  };
  // First answer: the chat opens as always; tuck it to the bubble (⇥).
  await ask("yes");
  await page.locator('[data-hpd-smoke="fc-agent-reply"]').waitFor({ state: "visible", timeout: 8000 });
  await page.locator('[data-hpd-smoke="fc-agent-tuck"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-bubble"]').waitFor({ timeout: 5000 });
  // Asked again with the chat in the bubble: a short plain answer stays in the bubble, whole.
  await ask("yes");
  const bubble = page.locator('[data-hpd-smoke="fc-agent-bubble-answer"]');
  await bubble.waitFor({ timeout: 8000 });
  assert.equal(await bubble.innerText(), "There's nothing waiting for a yes.");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').getAttribute("data-tucked"), "1");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-reply"]').isVisible(), false, "the chat stays closed");
  // A tap opens the chat with it.
  await page.locator('[data-hpd-smoke="fc-agent-bubble"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-reply"]').waitFor({ state: "visible", timeout: 5000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /nothing waiting for a yes/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').getAttribute("data-tucked"), null);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  // Opened again: the next answers open the chat as before.
  await ask("what's new");
  await page.waitForFunction(() => (document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").length > 20, null, { timeout: 8000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').getAttribute("data-tucked"), null, "a long answer opens the chat");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-reply"]').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log("PASS bubble answer: with the chat tucked, a short plain answer stays in the bubble (whole); a tap opens the chat and answers open it again");
} finally {
  await browser.close();
}
