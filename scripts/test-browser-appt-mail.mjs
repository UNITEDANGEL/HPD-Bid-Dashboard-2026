// 📅 -> ✉ (owner, 6 Nov: "that appointment should automatically be sent to Lewis also, just to keep her in the
// loop"): an iPhone sets an appointment on an ERP job; 15 seconds later the email goes to Lewis (from her notice);
// Undo stops it; Send now sends it at once, to her @hpd.nyc.gov address only.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const JOB = "ER02330";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const msg = (at, text) => ({ at, from: "Joy-Ann Lewis <lewis.test@hpd.nyc.gov>", hpd: true, mine: false, subject: "72", text, files: [] });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-72", subject: "72 HR POOR PERFORMANCE NOTICE- OMO#EQ15239", omos: ["EQ15239"], kind: "past due", people: ["Joy-Ann Lewis"], count: 1, lastAt: ago(30), waiting: true, messages: [msg(ago(30), "Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#EQ15239.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov")] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const mails = [];
  await c.route("**/api/drive/hpd-reply", (r) => { mails.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { sent: true } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  const book = async (date) => {
    await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(JOB).catch(() => {});
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.locator('[data-hpd-smoke="jc-step-appointment-open"]').first().click();
    const ed = page.locator("#fc-job-card .fc-appointment-editor");
    await ed.waitFor({ timeout: 10000 });
    await ed.locator('input[type="date"]').fill(date);
    await ed.locator('input[type="time"]').nth(0).fill("10:00");
    await ed.locator('input[type="time"]').nth(1).fill("12:00");
    await ed.locator("button.fc-next-action").click();
  };
  const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // 1) Saved -> the countdown to Lewis; Undo stops it.
  await book(day(4));
  const bar = page.locator('[data-hpd-smoke="fc-appt-mail"]');
  await bar.waitFor({ timeout: 10000 });
  assert.match(await bar.innerText(), /Telling Joy-Ann \(lewis\.test@hpd\.nyc\.gov\) about the appointment for ER02330 in 1\d s/);
  await page.locator('[data-hpd-smoke="fc-appt-mail-undo"]').click();
  await page.waitForTimeout(16000);
  assert.equal(mails.length, 0, "Undo: nothing sent");

  // 2) Saved again (another day) -> it goes by itself after 15 s.
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="jc-step-appointment-open"]').first().click();
  const ed = page.locator("#fc-job-card .fc-appointment-editor");
  await ed.waitFor({ timeout: 10000 });
  await ed.locator('input[type="date"]').fill(day(5));
  await ed.locator("button.fc-next-action").click();
  await bar.waitFor({ timeout: 10000 });
  for (let i = 0; i < 40 && !mails.length; i++) await page.waitForTimeout(500);
  assert.equal(mails.length, 1, "sent by itself");
  assert.equal(mails[0].to, "lewis.test@hpd.nyc.gov");
  assert.deepEqual(mails[0].cc, ["sauld@hpd.nyc.gov", "jagdeor@hpd.nyc.gov"], "ERP: Saul and Rishi get a copy (9 Nov)");
  assert.match(mails[0].subject, /^OMO# ER02330 - appointment (scheduled for|changed to) /);
  assert.match(mails[0].text, /^Hello Joy-Ann,\n\nRe: OMO# ER02330 - 1020 BOYNTON AVENUE/);
  await page.waitForFunction(() => /✓ Joy-Ann was told about the appointment for ER02330/.test(document.querySelector('[data-hpd-smoke="fc-appt-mail"]')?.textContent || ""), null, { timeout: 5000 });

  assert.deepEqual(errors, []);
  console.log("PASS appointment -> Lewis: 15 s countdown, Undo stops it, then it goes to her @hpd.nyc.gov address by itself");
} finally {
  await browser.close();
}
