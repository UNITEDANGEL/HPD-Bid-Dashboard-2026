// 📍 Go anyway (30 Oct) at iPhone size: a tenant not reached after 3 tries over 2+ days -> the contact box says to go for
// the 1st access attempt (No Access needs 2 visits 72 hours apart) and "Add to Today's route" puts the job on the route
// (a new route for today when there's none); the route panel lists it. A job with fewer tries has no such box.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const OTHER = "EQ24465";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await c.addInitScript(({ JOB, OTHER }) => {
    if (sessionStorage.getItem("seeded")) return;
    const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({
      [JOB]: { TenantTextedAt: ago(72), FieldVisitHistory: [
        { recordedAt: ago(72), outcome: null, note: "Texted the tenant the job summary: Leak" },
        { recordedAt: ago(50), outcome: null, note: "Called the tenant: no answer" },
        { recordedAt: ago(5), outcome: null, note: "Called the tenant: left a voicemail" },
      ] },
      [OTHER]: { FieldVisitHistory: [{ recordedAt: ago(72), outcome: null, note: "Called the tenant: no answer" }, { recordedAt: ago(5), outcome: null, note: "Called the tenant: no answer" }] },
    }));
    localStorage.removeItem("hpd-today-route-v1");
    sessionStorage.setItem("seeded", "1");
  }, { JOB, OTHER });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, 100); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const openJob = async (id) => {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator('[data-hpd-smoke="fc-jobs-search"]').fill(id);
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator('[data-hpd-smoke="jc-contact"]').waitFor({ timeout: 20000 });
  };
  // 2 tries: not yet.
  await openJob(OTHER);
  assert.equal(await page.locator('[data-hpd-smoke="jc-contact-go"]').count(), 0, "2 tries: keep calling");
  await page.locator(".fc-job-sheet-close").click();
  // 3 tries over 3 days: go anyway.
  await openJob(JOB);
  const go = page.locator('[data-hpd-smoke="jc-contact-go"]');
  assert.match(await go.innerText(), /📍 3 tries since .+ and no answer: go anyway for the 1st access attempt\. No Access needs 2 visits 72 hours apart\./);
  await go.locator('[data-hpd-smoke="jc-contact-go-add"]').click();
  await page.locator('[data-hpd-smoke="jc-contact-go-done"]').waitFor({ timeout: 5000 });
  if (shots) await page.screenshot({ path: `${shots}/go-anyway.png` });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null"));
  assert.deepEqual(saved.ids, [JOB]);
  assert.equal(saved.settings.start, "08:00");
  await page.locator(".fc-job-sheet-close").click();
  if (await page.locator('[data-hpd-smoke="fc-jobs-close"]').count()) await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  // By voice (30 Oct): take it off the route, then put it back.
  const say = async (s, re) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.evaluate((x) => { window.__hear = x; }, s);
    await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
    await page.waitForFunction((r) => new RegExp(r).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 20000 });
  };
  const routeIds = () => page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null")?.ids);
  await say(`take ${JOB} off my route`, /^Took 1207 1 AVENUE off Today's route\. 0 stops left\./);
  assert.deepEqual(await routeIds(), []);
  await say(`put ${JOB} on today's route`, /^Added 1207 1 AVENUE to Today's route: stop 1\./);
  assert.deepEqual(await routeIds(), [JOB]);
  await say(`add ${JOB} to my route`, /already on Today's route: stop 1/);
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  // The route panel lists it.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-route-open"]').click();
  await page.waitForFunction((j) => [...document.querySelectorAll(".fc-route-stop b")].some((b) => b.textContent.includes(j)), JOB, { timeout: 20000 });
  // The panel took the stop added from the card / by voice (not a new plan saved over it).
  assert.deepEqual(await page.locator("li:not(.fc-route-done-row) > .fc-route-stop b").allInnerTexts(), [`1. ${JOB}`]);
  assert.deepEqual(await routeIds(), [JOB]);
  // The tenant on the route stop (30 Oct): not reached after 3 tries -> an access attempt.
  const stopText = await page.locator(".fc-route-stop", { hasText: JOB }).first().innerText();
  assert.match(stopText, /🟡 Tenant not reached \(3 tries\): access attempt/, stopText);
  if (shots) await page.screenshot({ path: `${shots}/go-anyway-route.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS go anyway: 2 tries -> nothing; 3 tries over 3 days -> "go anyway for the 1st access attempt", Add to Today's route -> ✅ on the route; by voice taken off, put back, "already on"; the route panel lists ${JOB} with 🟡 access attempt`);
  await c.close();
} finally {
  await browser.close();
}
