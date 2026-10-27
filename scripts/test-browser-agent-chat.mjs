// The helper as a conversation (27 Oct, owner: "say anything about the app and get it updated … send the AI the message
// and it forwards to Claude") at iPhone size with real jobs. Speech is faked; the status server is faked (nothing saved).
// "Tell Claude to …" -> saved as a change request (CHANGE-REQUEST-…) -> "Sent to Claude"; typing in the box works like
// speaking; the earlier turns stay on screen; "My requests" opens What's new with Your requests.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { try { posted.push(JSON.parse(r.request().postData() || "{}")); } catch { /* not json */ } return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, window.__hearDelay || 100); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const waitReply = async (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 20000 });

  // 0. ✨ The AI on the map: one tap opens the helper already listening, most pressing thing first; what you say is answered.
  const orb = page.locator('[data-hpd-smoke="fc-ai-orb"]');
  assert.ok(await orb.isVisible(), "AI button on the map");
  const box = await orb.boundingBox();
  assert.ok(box && box.x >= 0 && box.y > 300 && box.y + box.height < 844, `AI button on screen: ${JSON.stringify(box)}`);
  await page.evaluate(() => { window.__hear = "what do I have today"; window.__hearDelay = 1500; });
  await orb.click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-heard"]').innerText(), "✨ Your AI helper");
  assert.match(await reply.innerText(), /^Hi! /);
  assert.equal(await orb.count(), 0, "the button hides while the helper is open");
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-talk"]').getAttribute("aria-pressed"), "true", "conversation mode on");
  await page.waitForFunction(() => /what do I have today/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""), null, { timeout: 20000 });
  if (shots) await page.screenshot({ path: `${shots}/agent-orb.png` });
  await page.evaluate(() => { window.__hear = ""; window.__hearDelay = 0; });
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  assert.ok(await orb.isVisible(), "AI button back after closing");

  // 1. Said: "Tell cloud to …" (how the iPhone often hears Claude).
  await page.evaluate(() => { window.__hear = "Tell cloud to make the zoom smoother when I close a job card"; });
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  await waitReply(/Sent to Claude for the next upgrade/);
  assert.match(await reply.innerText(), /"Make the zoom smoother when I close a job card"/);
  // 💡 Before you ask: the most pressing thing shows in the helper (the map's pill), when there is one.
  const pillShown = await page.evaluate(() => Boolean(document.querySelector('[data-hpd-smoke="fc-agent-hint"]')));
  if (pillShown) assert.match(await page.locator('[data-hpd-smoke="fc-agent-hint"]').innerText(), /^💡 .+ ▶$/);
  const req = posted.find((p) => /^CHANGE-REQUEST-\d{14}$/.test(p.key || ""));
  assert.ok(req, "saved as a change request");
  assert.equal(req.patch.text, "(said to the helper) Make the zoom smoother when I close a job card");

  // 2. Typed: works like speaking; the first turn stays on screen above.
  await page.locator('[data-hpd-smoke="fc-agent-type-btn"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-type-input"]').fill("what's next");
  await page.locator('[data-hpd-smoke="fc-agent-type-send"]').click();
  await waitReply(/^Next: |Nothing urgent right now/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-hint"]').count(), 0, "no 💡 line when the answer is already the next step");
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-past"]').last().innerText(), /make the zoom smoother[\s\S]*Sent to Claude/i);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-type-input"]').inputValue(), "", "the box empties after sending");
  if (shots) await page.screenshot({ path: `${shots}/agent-chat.png` });
  // 👉 Try: what to say next, minus what was just said; one tap runs it like speaking.
  const chips = await page.locator('[data-hpd-smoke="fc-agent-try-chip"]').allInnerTexts();
  assert.ok(chips.includes("what do I have today"), `chips: ${chips}`);
  assert.ok(!chips.includes("what's next"), "the question just asked is not offered again");
  await page.locator('[data-hpd-smoke="fc-agent-try-chip"]', { hasText: "what do I have today" }).click();
  await page.waitForFunction(() => /what do I have today/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""), null, { timeout: 20000 });
  await page.waitForFunction(() => !/^(…|Thinking)/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "…"), null, { timeout: 20000 });
  assert.ok((await page.locator('[data-hpd-smoke="fc-agent-try-chip"]').allInnerTexts()).every((t) => t !== "what do I have today"));

  // 3. Typed straight to Claude, then My requests opens the list.
  await page.locator('[data-hpd-smoke="fc-agent-type-input"]').fill("send to Claude: add a dark mode");
  await page.locator('[data-hpd-smoke="fc-agent-type-input"]').press("Enter");
  await waitReply(/Sent to Claude for the next upgrade: "Add a dark mode"/);
  assert.ok(posted.some((p) => p.patch?.text === "(said to the helper) Add a dark mode"));
  await page.locator('[data-hpd-smoke="fc-agent-action"]', { hasText: "My requests" }).click();
  await page.locator('[data-hpd-smoke="fc-whatsnew"]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS helper chat: "Tell cloud to make the zoom smoother…" -> change request saved, "Sent to Claude", with a 💡 next-step line; typed "what\'s next" answers with the earlier turn still on screen; typed "send to Claude: add a dark mode" -> sent; My requests opens What\'s new');
  await c.close();
} finally {
  await browser.close();
}
