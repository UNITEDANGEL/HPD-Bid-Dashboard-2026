// ⏰ Job is taking long (idea list): "I'm here" at a job 2 hours ago, usual 1 hour, today's route has a next stop with a
// tenant phone -> the helper's note "⏰ 2 h at … (usually 1 h). Tell the next tenant … you're running late?"; 📱 Text ->
// the "running late" text to that tenant, ready to send (nothing sent by itself). Clock: Monday 2 PM New York.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const DAY = "2026-11-09";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(`${DAY}T19:00:00Z`) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // Two to-do jobs: one to be at, the next with a tenant phone.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let NEXT = "";
  for (const id of ids.slice(0, 40)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.clock.runFor(400);
    const has = await page.locator('[data-hpd-smoke="jc-text-tenant"]').count();
    await page.locator(".fc-job-sheet-close").click();
    if (has) { NEXT = id; break; }
  }
  const HERE = ids.find((id) => id !== NEXT);
  assert.ok(NEXT && HERE, "two to-do jobs, the next one with a tenant phone");
  await page.evaluate(({ HERE, NEXT, DAY }) => {
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [HERE]: { FieldArrivedAt: `${DAY}T17:00:00.000Z` } }));
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: DAY, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: [HERE, NEXT], origin: { point: { lat: 40.7, lng: -73.9 }, label: "office" } }));
  }, { HERE, NEXT, DAY });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // Other notes first are put away until the long-job one shows.
  const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"]');
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(1000);
    if (await page.locator('[data-hpd-smoke="fc-chat-nudge"][data-kind="long"]').count()) break;
    if (await nudge.count()) await page.locator('[data-hpd-smoke="fc-chat-nudge-close"]').first().click();
  }
  const long = page.locator('[data-hpd-smoke="fc-chat-nudge"][data-kind="long"]');
  await long.waitFor({ timeout: 5000 });
  assert.match(await long.innerText(), /⏰ 2 h at .+ \(usually 1 h\)\. Tell the next tenant, .+, you're running late\?/);
  await long.locator('[data-hpd-smoke="fc-chat-nudge-go"]').click();
  await page.waitForFunction(() => /running a little late/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });
  const act = page.locator('[data-hpd-smoke="fc-agent-action"]', { hasText: "Send: there around" });
  assert.match(decodeURIComponent((await act.getAttribute("href")).split("body=")[1]), /I'm running a little late for the HPD repair at .+\. I'll be there around \d{1,2}:\d{2} PM\./);
  assert.deepEqual(errors, []);
  console.log(`PASS long job: 2 h at ${HERE} (usually 1 h) -> offer to text ${NEXT}'s tenant; 📱 Text -> the running-late text ready to send`);
} finally {
  await browser.close();
}
