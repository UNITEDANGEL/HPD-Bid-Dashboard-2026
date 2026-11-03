// 👋 While you were away (owner, 3 Nov: "do all 1 by 1", pick 1 of making the chat smarter) at iPhone size.
// The app was last on screen 5 hours ago (hpd-last-seen); since then Claude finished one request and asked about
// another (status server faked). 1) Over the chat bar: "👋 While you were away: ✅ Claude finished … · ❓ Claude needs
// your answer …" with Tell me. 2) Tell me -> the helper answers "Since <time>:" with each line, said out loud.
// 3) Typed "what did I miss" later answers the same way. 4) Back after a few minutes: no catch-up line.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const overrides = {
  "CLAUDE-HEARTBEAT": { at: ago(2), every: 9 },
  "CHANGE-REQUEST-20261103080000": { at: ago(400), text: "Make the bid pins bigger" },
  "CHANGE-REPLY-20261103080000": { status: "Done", updates: [{ at: ago(60), text: "The bid pins are bigger." }], steps: [] },
  "CHANGE-REQUEST-20261103090000": { at: ago(390), text: "Add a dark map at night" },
  "CHANGE-REPLY-20261103090000": { status: "Waiting for you", updates: [{ at: ago(30), text: "From what time?" }], steps: [] },
};
const open = async (lastSeenMinutes) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  await c.addInitScript((at) => {
    if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-last-seen", at); sessionStorage.setItem("seeded", "1"); }
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); };
  }, ago(lastSeenMinutes));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  return { c, page, errors };
};
try {
  // 1) + 2) Back after 5 hours.
  const { c, page, errors } = await open(300);
  const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"]');
  for (let i = 0; i < 6; i++) {
    await nudge.waitFor({ timeout: 20000 });
    if ((await nudge.getAttribute("data-kind")) === "away") break;
    await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').click(); // a bid due within the hour etc. comes first
  }
  assert.equal(await nudge.getAttribute("data-kind"), "away");
  const text = await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText();
  assert.match(text, /^👋 While you were away: .*✅ Claude finished “Make the bid pins bigger”.*❓ Claude needs your answer on “Add a dark map at night”/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/catch-up.png` }).catch(() => {});
  await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]').click();
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  await page.waitForFunction(() => /^Since /.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  const r = await reply.innerText();
  assert.match(r, /• ✅ Claude finished “Make the bid pins bigger”/);
  assert.match(r, /• ❓ Claude needs your answer on “Add a dark map at night”/);
  await page.waitForFunction(() => window.__said.some((s) => /^Since /.test(s)), null, { timeout: 5000 });
  // 3) Asked again in the chat later.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("what did I miss");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /Claude finished “Make the bid pins bigger”/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.deepEqual(errors, []);
  await c.close();

  // 4) Back after 10 minutes: no catch-up line.
  const b = await open(10);
  await b.page.waitForTimeout(4000);
  assert.equal(await b.page.locator('[data-hpd-smoke="fc-chat-nudge"][data-kind="away"]').count(), 0, "no catch-up after a short break");
  await b.c.close();
  console.log(`PASS catch up: back after 5 h -> "${text.slice(0, 90)}…" over the chat; Tell me -> "Since …" with each line, said out loud; "what did I miss" later answers the same; back after 10 min -> nothing`);
} finally {
  await browser.close();
}
