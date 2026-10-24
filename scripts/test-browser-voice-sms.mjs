// Texting a tenant hands-free (23 Oct), with the text service on (faked; nothing is sent): "text the tenant for <job>"
// reads the ready text out and waits; "yes" sends it once from the business number and marks the job texted; the job
// card's "Send it now" needs two taps. The job: the first to-do job with a tenant phone.
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
  await c.route("**/api/drive/tenant-sms-inbox", (r) => r.fulfill({ json: { ready: true, replies: [] } }));
  const sent = [];
  await c.route("**/api/drive/tenant-sms", (r) => { sent.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { sent: true, to: "***1234", sid: "SM1" } }); });
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
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let JOB = "";
  for (const id of ids.slice(0, 40)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    const has = await page.locator('[data-hpd-smoke="jc-text-tenant"]').count();
    await page.locator(".fc-job-sheet-close").click();
    if (has) { JOB = id; break; }
  }
  assert.ok(JOB, "a to-do job with a tenant phone");
  const say = async (s, re) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.evaluate((x) => { window.__hear = x; }, s);
    await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
    await page.waitForFunction((r) => new RegExp(r).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 20000 });
    return (await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText()).trim();
  };
  const ask = await say(`text the tenant for ${JOB}`, /Say yes to send it/);
  assert.match(ask, /this is Jot from United Angel Construction/);
  assert.equal(sent.length, 0, "nothing sent before the yes");
  await say("yes", /^Sent\./);
  assert.equal(sent.length, 1, "sent once");
  assert.match(sent[0].text, /HPD sent us to do a repair at/);
  const rec = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j], JOB);
  assert.ok(rec?.TenantTextedAt, "the job is marked texted");
  // On the card: "Send it now" asks for a second tap.
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="jc-text-tenant"]').scrollIntoViewIfNeeded();
  await page.locator('[data-hpd-smoke="jc-text-tenant"]').click();
  const btn = page.locator('[data-hpd-smoke="jc-tenant-send-sms"]');
  await btn.click();
  assert.match(await btn.innerText(), /Tap again/);
  assert.equal(sent.length, 1, "first tap only arms");
  await btn.click();
  await page.locator('[data-hpd-smoke="jc-tenant-sms-status"]', { hasText: "Sent to ***1234" }).waitFor({ timeout: 10000 });
  assert.equal(sent.length, 2);
  assert.deepEqual(errors, []);
  console.log(`PASS voice texts: "text the tenant for ${JOB}" read the text and waited; "yes" sent it once and marked the job texted; the card's Send it now took two taps`);
  await c.close();
} finally {
  await browser.close();
}
