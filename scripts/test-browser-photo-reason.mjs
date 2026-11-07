// 📝 Say why there is no photo (idea list): "I'm here" at EQ15239 earlier today, no after photo, no result saved, and
// the phone is now 400 m away -> the helper says so with three taps: No access / Tenant refused / Completed by others;
// "No access" reads it back, yes saves the visit's result on the job. Clock: Monday 2 PM New York.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const DAY = "2026-11-09";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", geolocation: { latitude: 40.75, longitude: -73.9, accuracy: 20 }, permissions: ["geolocation"] });
  await routePrivate(c);
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") { try { posted.push(JSON.parse(r.request().postData() || "{}")); } catch { /* not json */ } return r.fulfill({ json: { ok: true } }); } return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  await c.addInitScript(({ JOB, DAY }) => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [JOB]: { FieldArrivedAt: `${DAY}T18:20:00.000Z` } })); sessionStorage.setItem("seeded", "1"); }
  }, { JOB, DAY });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(`${DAY}T19:00:00Z`) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // 400 m north of the job.
  await c.setGeolocation({ latitude: 40.76365 + 0.0036, longitude: -73.95938, accuracy: 20 });
  await page.clock.runFor(3000);
  const choices = page.locator('[data-hpd-smoke="fc-agent-choice"]');
  await page.waitForFunction(() => /no after photo/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.ok((await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText()).includes(`You're leaving 1207 1 AVENUE (${JOB}) with no after photo`));
  assert.deepEqual(await choices.allInnerTexts(), [`No access at ${JOB}`, `Tenant refused at ${JOB}`, `Completed by others at ${JOB}`]);
  await choices.first().click();
  await page.waitForFunction(() => /Say yes/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /no access/i);
  await page.locator('[data-hpd-smoke="fc-agent-yes"]').click();
  await page.waitForFunction(() => /Saved\./.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });
  const saved = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j], JOB);
  assert.match(String(saved.FieldOutcome), /NO_ACCESS/);
  assert.deepEqual(errors, []);
  console.log(`PASS photo reason: leaving ${JOB} with no after photo -> No access / Tenant refused / Completed by others; No access -> yes -> saved (${saved.FieldOutcome})`);
} finally {
  await browser.close();
}
