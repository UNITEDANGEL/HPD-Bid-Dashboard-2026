// 🤖 The helper feels alive (owner's 4 picks, 3 Nov) at iPhone size: 1) an alert comes in: the 🤖 jumps (a tap on the
// shoulder) and, when it's good news ("✅ Claude finished"), its face smiles for a while. 2) Press and hold the 🤖: it
// grows into the helper listening ("let go when you're done"); letting go hears the words and answers. A quick tap still
// opens the helper the usual way.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    // Push to talk: the words come when listening stops (the finger lets go).
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { window.__listening = true; }
      stop() { window.__listening = false; const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const orb = page.locator('[data-hpd-smoke="fc-claude-orb"]');
  await orb.waitFor();

  // 1) Good news comes in: a jump and a smile.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "claude", go: "requests", title: "✅ Claude finished your request", text: "Try it" } })));
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-claude-orb"]')?.getAttribute("data-tap") === "1", null, { timeout: 3000 });
  assert.equal(await orb.locator('[data-hpd-smoke="fc-face"]').getAttribute("data-mode"), "happy", "it smiles");
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-claude-orb"]')?.getAttribute("data-tap"), null, { timeout: 4000 });
  await page.locator('[data-hpd-smoke="fc-ping-close"], [data-hpd-smoke="fc-hpd-ping-close"]').first().click({ timeout: 2000 }).catch(() => {});

  // 2) Press and hold: the helper listens until the finger lets go.
  await page.evaluate(() => { window.__hear = "what do I have today"; });
  const b = await orb.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => /let go when you're done/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__listening), true, "listening while held");
  assert.match(await page.locator('[data-hpd-smoke="fc-agent"]').getAttribute("class"), /is-from-dock/, "grew out of the 🤖");
  await page.mouse.up();
  await page.waitForFunction(() => /what do I have today/.test(document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || ""), null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__listening), false, "stopped when let go");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 3) 👀 The eyes look toward a tap on the map.
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerdown", { clientX: 30, clientY: 300, bubbles: true })));
  await page.waitForFunction(() => /translate\(-/.test(document.querySelector('[data-hpd-smoke="fc-claude-orb"] .fc-face-look')?.getAttribute("style") || ""), null, { timeout: 3000 });
  // 4) A quick tap: the magic. Sparkles burst out, the big face rises and greets you by name and time of day.
  await page.evaluate(() => { window.__hear = ""; window.__said = []; if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); }; });
  await orb.click();
  await page.locator('[data-hpd-smoke="fc-magic"]').waitFor({ state: "attached", timeout: 3000 });
  await page.waitForFunction(() => /^Good (morning|afternoon|evening), Jot!.*What can I do for you\?$/.test((document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").trim()), null, { timeout: 5000 });
  const big = await page.locator('[data-hpd-smoke="fc-agent-who"] [data-hpd-smoke="fc-face"]').getAttribute("width");
  assert.equal(big, "84", "the big face");
  await page.waitForFunction(() => window.__said.some((t) => /^Good (morning|afternoon|evening), Jot!/.test(t)), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  console.log("PASS helper alive: an alert makes the 🤖 jump and good news makes it smile; press and hold listens until you let go, then answers; the eyes look at a tap; a tap brings the magic: sparkles, the big face, a spoken hello by name and time of day");
} finally {
  await browser.close();
}
