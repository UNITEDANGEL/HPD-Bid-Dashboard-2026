// 🤖 The helper talks more (owner's 4 picks, 4 Nov) at iPhone size: 1) 🗨 short news pops up in a speech bubble over
// the 🤖 without opening the chat; tapping the bubble opens it and reads it out loud. 2) 🎙 In 🎨 pick its voice and
// speed: each tap says a sample, and the pick is kept on the phone. 3) 🧭 After a job is read out loud, "take me there"
// starts Waze to that job. (📸 what it says about a new photo: scripts/test-photo-check.cjs.)
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  // Waze never really opens in a test: the page it would go to is answered here.
  let waze = "";
  await c.route(/waze\.com/, (r) => { waze = r.request().url(); return r.fulfill({ contentType: "text/html", body: "<title>Waze</title>Waze" }); });
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (u) => { window.__said.push(u.text); window.__rate = u.rate; window.__voice = u.voice?.name || ""; setTimeout(() => u.onend?.(), 30); };
      const fake = [{ name: "Ava (Premium)", lang: "en-US" }, { name: "Evan (Enhanced)", lang: "en-US" }, { name: "Samantha", lang: "en-US" }];
      window.speechSynthesis.getVoices = () => fake;
      // The phone's voices are made up here: let the utterance take one.
      Object.defineProperty(SpeechSynthesisUtterance.prototype, "voice", { configurable: true, set(v) { this._v = v; }, get() { return this._v || null; } });
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; window.__hear = ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, 50); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 0) 👋 Hello on open (asked for in this test): the robot says hi in its bubble.
  await page.evaluate(() => { localStorage.setItem("hpd-test-hello", "1"); localStorage.removeItem("hpd-robot-hello"); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.waitForFunction(() => /^👋 (Good morning|Hi|Good evening), Jot!/.test(document.querySelector('[data-hpd-smoke="fc-orb-say"]')?.textContent || ""), null, { timeout: 8000 });
  await page.evaluate(() => localStorage.removeItem("hpd-test-hello"));
  // 😄 First bid fax of the day: a cheer in the bubble.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "fax-ok", title: "Bid fax went through · ER09999", text: "$1,200.00" } })));
  await page.waitForFunction(() => /First bid of the day/.test(document.querySelector('[data-hpd-smoke="fc-orb-say"]')?.textContent || ""), null, { timeout: 3000 });
  // 1) 🗨 The bubble.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "fax-ok", title: "📠 Fax to HPD went through for ER06362", text: "HPD has the bid now." } })));
  const bubble = page.locator('[data-hpd-smoke="fc-orb-say"]');
  await bubble.waitFor({ timeout: 3000 });
  assert.match(await bubble.innerText(), /Fax to HPD went through/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').count(), 0, "the chat stays closed");
  await page.evaluate(() => { window.__said = []; });
  await page.locator('[data-hpd-smoke="fc-ping-close"], [data-hpd-smoke="fc-hpd-ping-close"]').first().click({ timeout: 2000 }).catch(() => {});
  await bubble.click();
  await page.waitForFunction(() => /HPD has the bid now/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 3000 });
  await page.waitForFunction(() => window.__said.some((t) => /HPD has the bid now/.test(t)), null, { timeout: 3000 });

  // 2) 🎙 Its voice.
  await page.locator('[data-hpd-smoke="fc-agent-dress"]').click();
  const voices = page.locator('[data-hpd-smoke="fc-dress-voice"]');
  await voices.first().waitFor({ timeout: 3000 });
  assert.match(await voices.filter({ hasText: "Ava" }).innerText(), /👩/);
  assert.match(await voices.filter({ hasText: "Evan" }).innerText(), /👨/);
  await page.evaluate(() => { window.__said = []; });
  await voices.filter({ hasText: "Evan" }).click();
  await page.waitForFunction(() => window.__said.some((t) => /this is how I sound now/.test(t)), null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-voice-name")), "Evan (Enhanced)");
  assert.equal(await voices.filter({ hasText: "Evan" }).getAttribute("aria-pressed"), "true");
  await page.locator('[data-hpd-smoke="fc-dress-rate"][data-rate="1.15"]').click();
  await page.waitForFunction(() => window.__rate > 1.1, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-voice-rate")), "1.15");
  // 🔋 Battery saver in 🎨: nothing moves while it's on.
  await page.locator('[data-hpd-smoke="fc-dress-saver"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("hpd-saver")), true);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent"]').evaluate((el) => getComputedStyle(el).animationName), "none");
  await page.locator('[data-hpd-smoke="fc-dress-saver"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("hpd-saver")), false);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 🎯 The goal ring: a bid due later today marked sent on this phone fills part of the ring.
  const bid = await page.evaluate(async () => {
    const d = await (await fetch("/data/upcoming_bids.json")).json();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const now = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
    const min = (t) => { const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]) : 1440; };
    const b = (d.bids || []).find((x) => x.omo && x.bidDue === today && min(x.bidDueTime) > now[0] * 60 + now[1]);
    if (!b) return null;
    const recs = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}");
    recs[b.omo] = { ...(recs[b.omo] || {}), status: "sent", bidDue: b.bidDue };
    localStorage.setItem("hpd-bid-records-v1", JSON.stringify(recs));
    return b.omo;
  });
  if (bid) {
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => Number(document.querySelector('[data-hpd-smoke="fc-goal-ring"]')?.getAttribute("data-sent") || 0) >= 1, null, { timeout: 30000 });
    const ring = page.locator('[data-hpd-smoke="fc-goal-ring"]');
    assert.ok(Number(await ring.getAttribute("data-total")) >= Number(await ring.getAttribute("data-sent")), "sent never more than the total");
  }

  // 3) 🧭 Read a job, then "take me there".
  const JOB = "ER06362";
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  await page.locator('[data-hpd-smoke="jc-read"]').click();
  await page.waitForFunction((j) => (document.querySelector('[data-hpd-smoke="fc-agent-heard"]')?.textContent || "").includes(`📣 Job ${j}`), JOB, { timeout: 5000 });
  assert.ok(await page.getByRole("link", { name: /Take me there/ }).count(), "a Take me there button with the reading");
  // 🚶 The robot walks over to the job's pin and waves.
  await page.locator(`[data-hpd-smoke="fc-walk-bot"][data-omo="${JOB}"]`).waitFor({ state: "attached", timeout: 3000 });
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-walk-bot"]')?.classList.contains("is-there"), null, { timeout: 5000 });
  // Close the card so "there" can only mean the job just read.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator(".fc-job-sheet-close").click();
  await page.locator("#fc-job-card").waitFor({ state: "detached", timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("take me there");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForURL(/waze/, { timeout: 8000 });
  assert.match(waze, /navigate=yes/);
  assert.ok(errors.length === 0, errors.join(" | "));

  console.log(`PASS helper talks: battery saver stops the motion; goal ring ${bid ? "fills with a sent bid" : "(no bid due later today)"}; ` + "a hello bubble on open; a cheer at the first bid; the robot walks to the job read; short news in a speech bubble over the 🤖 (tap: read out loud); 👩/👨 voices and speed in 🎨 with a sample, kept on the phone; a job read, then \"take me there\" starts Waze to it");
} finally {
  await browser.close();
}
