// 🔁 ☎️ 🔥 🛒 (owner, 5 Nov: "do all"): "translate" opens Talk with the tenant (typed English comes back in Spanish, big,
// and is said out loud); the job card's 🔁 Talk both ways opens it too; "what do I say to HPD about <job>" gives the
// 3 things to say; "my streak" counts work days with bids sent; "store on my way" finds the store with the fewest
// extra minutes (OpenStreetMap faked). No real AI or network.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "ER06362";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const translated = [];
  await c.route(/\/api\/drive\/hpd-translate/, (r) => { const b = JSON.parse(r.request().postData() || "{}"); translated.push(b); return r.fulfill({ json: { ai: true, text: b.to === "es" ? "El agua está cerrada por diez minutos." : "The bathroom is leaking." } }); });
  await c.route(/overpass-api\.de/, (r) => r.fulfill({ json: { elements: [
    { lat: 40.70, lon: -73.80, tags: { shop: "doityourself", name: "The Home Depot", "addr:housenumber": "50", "addr:street": "Test Ave" } },
    { lat: 40.80, lon: -73.95, tags: { shop: "hardware", name: "Far Hardware" } },
  ] } }));
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
    // Bids sent the last 3 work days (Mon-Wed), today Thu 5 Nov.
    if (!sessionStorage.getItem("seeded")) {
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("hpd-bid-records-v1", JSON.stringify({ EQ00001: { status: "sent", sentAt: "2026-11-02T15:00:00Z" }, EQ00002: { status: "sent", sentAt: "2026-11-03T15:00:00Z" }, EQ00003: { status: "sent", sentAt: "2026-11-04T15:00:00Z" } }));
    }
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-11-05T15:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const say = async (text, re) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    if (!re) return "";
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 20000 }).catch(async () => { throw new Error(`"${text}" got: ${await reply.innerText().catch(() => "no chat")}`); });
    return reply.innerText();
  };

  // 🔥 Streaks.
  const streak = await say("my streak", /3 work days in a row with bids sent/);
  assert.match(streak, /send one today to keep it going/);

  // ☎️ What to say to HPD.
  const hpd = await say(`what do I say to HPD about ${JOB}`, /1️⃣ The job: ER06362/);
  assert.match(hpd, /2️⃣ What was done: [\s\S]*3️⃣ When: /);

  // 🛒 The store on the way.
  const store = await say("store on my way", /The Home Depot, 50 Test Ave: about \d+ min out of your way/);
  assert.ok(await page.locator('[data-hpd-smoke="fc-agent"] a', { hasText: "Just the store" }).count() || await page.locator("a", { hasText: "Just the store" }).count(), "store link");

  // 🔁 Translate: typed English -> Spanish, big on the screen, said out loud.
  await say("translate");
  const panel = page.locator('[data-hpd-smoke="fc-translate"]');
  await panel.waitFor({ timeout: 5000 });
  await page.evaluate(() => { window.__said = []; });
  await page.locator('[data-hpd-smoke="fc-translate-input"]').fill("The water is off for ten minutes.");
  await page.locator('[data-hpd-smoke="fc-translate-send"]').click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-translate-out"]')?.textContent === "El agua está cerrada por diez minutos.", null, { timeout: 5000 });
  await page.waitForFunction(() => window.__said.includes("El agua está cerrada por diez minutos."), null, { timeout: 3000 });
  assert.deepEqual(translated[0], { text: "The water is off for ten minutes.", from: "en", to: "es" });
  // Another language, then closed.
  await page.locator('[data-hpd-smoke="fc-translate-lang"][data-lang="zh"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-translate-lang"][aria-pressed="true"]').getAttribute("data-lang"), "zh");
  await page.locator('[data-hpd-smoke="fc-translate-close"]').click();
  await panel.waitFor({ state: "detached", timeout: 3000 });

  // The job card's 🔁 Talk both ways and ☎️ HPD calling.
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  const both = page.locator('#fc-job-card [data-hpd-smoke="jc-translate"]');
  await page.waitForTimeout(1500);
  if (await both.count()) {
    await both.click();
    await panel.waitFor({ timeout: 3000 });
    await page.locator('[data-hpd-smoke="fc-translate-close"]').click();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS talk & store: "${streak.split("\n")[0]}"; HPD: "${hpd.replace(/\s+/g, " ").slice(0, 80)}…"; "${store.replace(/\s+/g, " ").slice(0, 70)}"; translate typed English -> Spanish, said out loud; ${await both.count() ? "job card Talk both ways opens it" : "(job has no tenant section)"}`);
} finally {
  await browser.close();
}
