// A tenant's reply becomes the appointment (owner's award-to-payment plan, step 4; 23 Oct), text service on (faked;
// nothing is sent): the tenant texts back "Thursday at 10 works for me" -> the job is marked replied, the helper offers
// "Make the appointment ... Thu 10–11 AM?" -> Yes saves it (confirmed) and texts the tenant the confirmation.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route("**/api/drive/session", (r) => r.fulfill({ json: { configured: true, connected: true, smsReady: true, aiReady: false, canEmail: true } }));
  let inbox = [{ from: "+12125550000", body: "old", at: "2026-10-20T10:00:00.000Z" }];
  await c.route("**/api/drive/tenant-sms-inbox", (r) => { const { since } = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { ready: true, replies: inbox.filter((m) => !since || m.at > since) } }); });
  const sent = [];
  await c.route("**/api/drive/tenant-sms", (r) => { sent.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { sent: true, to: "***1234", sid: "SM1" } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // A to-do job with a tenant phone, and that phone.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let JOB = "", phone = "";
  for (const id of ids.slice(0, 40)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    if (await page.locator('[data-hpd-smoke="jc-text-tenant"]').count()) { JOB = id; phone = (await page.locator('[data-hpd-smoke="jc-tenant-call"]').getAttribute("href")).replace(/^tel:/, ""); }
    await page.locator(".fc-job-sheet-close").click();
    if (JOB) break;
  }
  assert.ok(JOB && phone, "a to-do job with a tenant phone");
  // The tenant answers (checked every 2 minutes).
  const digits = phone.replace(/\D/g, "").slice(-10);
  inbox = [...inbox, { from: `+1${digits}`, body: "Thursday at 10 works for me", at: new Date(Date.now() + 1000).toISOString() }];
  await page.clock.runFor(125000);
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  await page.waitForFunction(() => /Make the appointment/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.match(await reply.innerText(), /on Thu \d\d\/\d\d · 10–11 AM\? Say yes/);
  assert.equal(sent.length, 0, "nothing sent before the yes");
  await page.locator('[data-hpd-smoke="fc-agent-yes"]').click();
  await page.waitForFunction(() => /Saved: .*I texted/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.equal(sent.length, 1, "the confirmation text went once");
  assert.match(sent[0].text, /We are scheduled to come to .* between 10 and 11 AM/);
  const rec = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j], JOB);
  assert.equal(rec?.Appointment?.state, "confirmed");
  assert.equal(rec?.Appointment?.start, "10:00");
  assert.ok(rec?.TenantRepliedAt, "marked replied");
  // Your own words back, by voice: goes to the tenant who just texted, after a yes.
  await page.evaluate(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, 100); }
      stop() { this.onend?.(); }
    };
    window.__hear = "tell the tenant we'll call when we're on the way";
  });
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  await page.clock.runFor(500);
  await page.waitForFunction(() => /Say yes to send it/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.match(await reply.innerText(), /We'll call when we're on the way\./);
  await page.locator('[data-hpd-smoke="fc-agent-yes"]').click();
  await page.waitForFunction(() => /^Sent\./.test((document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").trim()), null, { timeout: 20000 });
  assert.equal(sent.length, 2, "your words went once");
  assert.match(sent[1].text, /this is Jot from United Angel Construction about .*: We'll call when we're on the way\./);
  // "Any texts from tenants?" reads their words with the job.
  await page.evaluate(() => { window.__hear = "any texts from tenants"; });
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  await page.clock.runFor(500);
  await page.waitForFunction(() => /texts? from tenants/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.match(await reply.innerText(), /: "Thursday at 10 works for me"/);
  assert.deepEqual(errors, []);
  console.log(`PASS reply -> appointment: ${JOB}'s tenant texted "Thursday at 10 works for me" -> offered Thu 10–11 AM -> Yes saved it (confirmed) and texted the confirmation once; "tell the tenant we'll call when we're on the way" went to them after a yes`);
  await c.close();
} finally {
  await browser.close();
}
