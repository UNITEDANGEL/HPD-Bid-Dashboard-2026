// 🧭 Job tracker on an iPhone with the real job list (owner, 23 Oct: "track throughout the job all the way to close and
// payment"): "show my job tracker" opens it, the stage counts add up to every job, a stage opens its list, and a job
// opens its card on the map.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
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
  await page.evaluate(() => { window.__hear = "show my job tracker"; });
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-tracker"]');
  await sheet.waitFor({ timeout: 20000 });
  const total = Number((await sheet.locator("header strong").innerText()).match(/(\d+) jobs/)[1]);
  const counts = await sheet.locator('[data-hpd-smoke^="fc-tracker-count-"]').allInnerTexts();
  assert.equal(counts.length, 10, "ten stages");
  assert.equal(counts.map(Number).reduce((a, b) => a + b, 0), total, "every job is in one stage");
  assert.ok(total > 50, `real jobs (${total})`);
  // The first stage with work is open; its jobs list.
  const openStage = sheet.locator(".fc-tracker-stage.is-open");
  await openStage.waitFor();
  const job = openStage.locator('[data-hpd-smoke="fc-tracker-job"]').first();
  const omo = (await job.locator("b").innerText()).trim();
  await page.waitForTimeout(600);
  if (shots) await page.screenshot({ path: `${shots}/job-tracker.png` });
  await job.click();
  await page.locator("#fc-job-card").waitFor({ timeout: 15000 });
  assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(omo), "the job's card opens");
  assert.equal(await sheet.count(), 0, "the tracker steps aside");
  // 📱 next to a job to text: the job opens with the tenant text written (when there's a tenant phone).
  await page.locator('[data-hpd-smoke="fc-tracker-open"]').evaluate((b) => b.click()).catch(() => {});
  if (!(await sheet.count())) { await page.evaluate(() => { window.__hear = "show my job tracker"; }); await page.locator('[data-hpd-smoke="fc-search-mic"]').click(); }
  await sheet.waitFor({ timeout: 20000 });
  const textBtns = sheet.locator('[data-hpd-smoke="fc-tracker-text"]');
  assert.ok(await textBtns.count() > 0, "📱 on the jobs to text");
  await textBtns.first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 15000 });
  if (await page.locator('[data-hpd-smoke="jc-text-tenant"]').count()) await page.locator('[data-hpd-smoke="jc-tenant-draft"]').waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(`PASS job tracker: "show my job tracker" -> ${total} jobs in 10 stages (${counts.join(" / ")}), first stage with work open, ${omo} opens its card`);
  await c.close();
} finally {
  await browser.close();
}
