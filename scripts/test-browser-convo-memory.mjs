// 🧠 It remembers our conversation (plan item 15), typed in the chat on an iPhone: "plan my week", then "say that
// again" gives that answer back, "what did we talk about" lists today's talk; kept on the phone only.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") posted.push(r.request().postData() || ""); return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const say = async (text, re) => {
    await page.locator('[data-hpd-smoke="fc-agent-close"]').click({ timeout: 1500 }).catch(() => {});
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 10000 });
    return page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  };
  await say("plan my week", /^🗓 Your week, planned/);
  assert.match(await say("say that again", /^🧠 At /), /when you said "plan my week", I said: 🗓 Your week, planned/);
  assert.match(await say("what did we talk about", /^🧠 Today we talked/), /Last you asked: "say that again", "plan my week"/);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-convo-v1") || "{}"));
  assert.ok(kept.turns.length >= 2, "kept on the phone");
  assert.ok(!posted.some((b) => /plan my week/.test(b)), "never sent to the server");
  assert.deepEqual(errors, []);
  console.log("PASS remembers our conversation: say that again = the last answer; what did we talk about = today's talk; kept on the phone only");
} finally {
  await browser.close();
}
