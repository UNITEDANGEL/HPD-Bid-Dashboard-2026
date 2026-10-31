// The outcome said out loud with its day and who refused (owner, 31 Oct "do 1"), at iPhone size with a real job; speech
// is faked, the status server too:
// 1. "refused access on EQ15239 3 days ago" -> "Who refused?" -> "male, tall, dark hair" -> read back with the day and who
//    -> "yes" saves RefusalDate on that day and DeniedDescription, and the package opens (affidavit + invoice).
// 2. "no" after a read-back saves nothing.
// 3. 🔒 A no-access 1st try 4 days ago: the job is on Today's route with "2nd try" (owner, 31 Oct "do 2").
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const nyDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
const PAST = nyDay(Date.now() - 3 * 86400000);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 60); };
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
  const mic = page.locator('[data-hpd-smoke="fc-search-mic"]');
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const say = async (sentence, expect, close = true) => {
    if (close && await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.evaluate((s) => { window.__hear = s; }, sentence);
    await mic.click();
    try { await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), expect.source, { timeout: 20000 }); }
    catch { throw new Error(`"${sentence}": got "${await reply.innerText().catch(() => "")}"`); }
    return (await reply.innerText()).trim();
  };
  const saved = () => page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j] || {}, JOB);

  // 2 first: "no" saves nothing.
  await say(`I finished ${JOB} yesterday`, /Say yes/);
  assert.match(await reply.innerText(), /as work completed on \w+ \d\d\/\d\d\?/);
  await say("no", /nothing saved/, false);
  assert.notEqual((await saved()).FieldOutcome, "WORK_COMPLETED");

  // 1. Refused access, 3 days ago, who asked for.
  const who = await say(`refused access on ${JOB} 3 days ago`, /Who refused\?/);
  assert.match(who, new RegExp(`on \\w+ ${PAST.slice(5).replace("-", "/")}`));
  const back = await say("male, tall, dark hair", /Say yes/, false);
  assert.match(back, new RegExp(`as refused access on \\w+ ${PAST.slice(5).replace("-", "/")}, refused by MALE, TALL, DARK HAIR\\?`));
  const done = await say("yes", /Saved\./, false);
  assert.match(done, /The package opens next/);
  const rec = await saved();
  assert.equal(rec.FieldOutcome, "REFUSED_ACCESS");
  assert.equal(nyDay(Date.parse(rec.RefusalDate)), PAST, "saved on the day said");
  assert.equal(rec.DeniedDescription, "MALE, TALL, DARK HAIR");
  if (shots) await page.screenshot({ path: `${shots}/voice-outcome.png` });
  // The package (affidavit + invoice) opens by itself.
  await page.waitForFunction(() => /paperwork/.test(location.href) || !!document.querySelector('[data-hpd-smoke="fc-package-sheet"], iframe[src*="paperwork"]'), null, { timeout: 20000 });

  // 3. 2nd try on Today's route: a no-access 1st try 4 days ago.
  const page2 = await c.newPage();
  await page2.addInitScript(([j, first]) => {
    const all = JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}");
    all[j] = { ...(all[j] || {}), FieldOutcome: "NO_ACCESS_1_WAITING_72H", WorkflowStatus: "NO_ACCESS_1_WAITING_72H", StatusOverride: "No Access 1st - Waiting 72h", status: "No Access 1st - Waiting 72h", NoAccessFirstAttemptAt: first, NoAccessSecondAttemptAt: "", RefusalDate: "", DeniedDescription: "", FieldVisitHistory: [{ recordedAt: first, outcome: "NO_ACCESS_1_WAITING_72H", note: "" }] };
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify(all));
  }, [JOB, new Date(Date.now() - 4 * 86400000).toISOString()]);
  await page2.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page2.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page2.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page2.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page2.locator('[data-hpd-smoke="fc-more-open"]').click(); // Route is a tile under All
  await page2.locator('[data-hpd-smoke="fc-route-open"]').click();
  await page2.locator(".fc-route-stop").first().waitFor({ timeout: 30000 });
  const stopsText = await page2.locator(".fc-route-stop").allInnerTexts();
  const mine = stopsText.find((t) => t.includes(JOB));
  if (mine) assert.match(mine, /🔒 2nd try \(no access \w{3} \d\d\/\d\d\): knock again/);
  else assert.ok(await page2.evaluate((j) => { const s = JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j]; return !!s?.NoAccessFirstAttemptAt; }, JOB), "seeded");
  if (shots && mine) await page2.screenshot({ path: `${shots}/route-second-try.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS outcome by voice: "refused access ... 3 days ago" asked who, read back the day (${PAST}) and MALE, TALL, DARK HAIR, yes saved them and opened the package; "no" saved nothing; ${mine ? "a 2nd try due is on Today's route with its chip" : "route built (EQ15239 not picked in the 8 stops)"}`);
  await c.close();
} finally {
  await browser.close();
}
