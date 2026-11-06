// ✉️ Email screen (owner, 6 Nov: "Add email feature to the app"): from a job card, "Email Lewis about this job" opens
// a ready email (to Lewis, OMO in the subject); a ready line goes in; "Send to me first" goes to the owner only;
// Send goes to her @hpd.nyc.gov address. "Someone else" only takes an @hpd.nyc.gov address. The side panel opens it too.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const JOB = "ER02330";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const msg = (at, from, text) => ({ at, from, hpd: true, mine: false, subject: "x", text, files: [] });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-72", subject: "72 HR POOR PERFORMANCE NOTICE- OMO#EQ15239", omos: ["EQ15239"], kind: "past due", people: ["Joy-Ann Lewis"], count: 1, lastAt: ago(30), waiting: true, messages: [msg(ago(30), "Joy-Ann Lewis <lewis.test@hpd.nyc.gov>", "Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#EQ15239.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov")] },
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

  // 1) From the job card.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(JOB).catch(() => {});
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  const open = page.locator('[data-hpd-smoke="jc-email"]');
  assert.match(await open.innerText(), /Email Lewis about this job/);
  await open.click();
  const sheet = page.locator('[data-hpd-smoke="fc-email-sheet"]');
  await sheet.waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-email-subject"]').inputValue(), "OMO# ER02330 - 1020 BOYNTON AVENUE, 10472");
  assert.match(await page.locator('[data-hpd-smoke="fc-email-person"].is-on').innerText(), /Joy-Ann Lewis/);
  await page.locator('[data-hpd-smoke="fc-email-line-noaccess"]').click();
  const text = await page.locator('[data-hpd-smoke="fc-email-text"]').inputValue();
  assert.match(text, /^Hi Joy-Ann,\n\nI went to OMO# ER02330 today and could not get access\..*\n\nThank you,\nJot Singh\nUnited Angel Construction Corp$/s);
  assert.equal(mails.length, 0, "nothing sent before a tap");

  await page.locator('[data-hpd-smoke="fc-email-self"]').click();
  await page.waitForFunction(() => /Sent to your own Gmail/.test(document.querySelector('[data-hpd-smoke="fc-email-status"]')?.textContent || ""));
  assert.equal(mails.length, 1); assert.equal(mails[0].toSelf, true); assert.equal(mails[0].to, undefined);

  // Someone else: a non-HPD address can't be sent.
  await page.locator('[data-hpd-smoke="fc-email-other"]').click();
  await page.locator('[data-hpd-smoke="fc-email-other-input"]').fill("someone@gmail.com");
  assert.ok(await page.locator('[data-hpd-smoke="fc-email-send"]').isDisabled(), "non-HPD address can't be sent");
  assert.match(await page.locator('[data-hpd-smoke="fc-email-text"]').inputValue(), /^Hello,/);
  await page.locator('[data-hpd-smoke="fc-email-person"]').first().click();
  assert.match(await page.locator('[data-hpd-smoke="fc-email-text"]').inputValue(), /^Hi Joy-Ann,/);

  await page.locator('[data-hpd-smoke="fc-email-send"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-email-sheet"]'), null, { timeout: 5000 });
  assert.equal(mails.length, 2);
  assert.equal(mails[1].to, "lewis.test@hpd.nyc.gov");
  assert.equal(mails[1].subject, "OMO# ER02330 - 1020 BOYNTON AVENUE, 10472");

  // 2) From the side panel (no job): opens with no subject.
  await page.locator(".fc-job-sheet-close").first().click();
  await page.waitForFunction(() => !document.querySelector("#fc-job-card"), null, { timeout: 10000 }).catch(() => {});
  if (!(await page.locator('[data-hpd-smoke="fc-side-email"]').count())) await page.locator('[data-hpd-smoke="fc-side-tab"]').click();
  await page.locator('[data-hpd-smoke="fc-side-email"]').click();
  await sheet.waitFor({ timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-email-subject"]').inputValue(), "");
  assert.equal(await page.locator('[data-hpd-smoke="fc-email-lines"]').count(), 0);
  await page.locator('[data-hpd-smoke="fc-email-close"]').click();

  assert.deepEqual(errors, []);
  console.log("PASS email screen: job card + side panel, ready lines, send to me first, HPD-only, Send to Lewis");
} finally {
  await browser.close();
}
