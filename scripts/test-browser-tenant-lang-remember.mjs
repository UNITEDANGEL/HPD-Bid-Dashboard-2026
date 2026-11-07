// 🌐 Remember the tenant's language (idea list, 4 Nov): a tenant texts back in Chinese -> the app remembers it for that
// job (on the phone only); 📱 Text tenant on that job writes the text in Chinese with the English below, the 中文 chip on;
// a one-tap message (On the way) goes into Chinese too; 📤 Send it now (two taps) sends the Chinese; English puts it back
// and forgets the language. No real AI or texts.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ZH = "你好，我们是 United Angel Construction。我们什么时候可以来修理？";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route("**/api/drive/session", (r) => r.fulfill({ json: { configured: true, connected: true, smsReady: true, aiReady: false, canEmail: true } }));
  let inbox = [{ from: "+12125550000", body: "old", at: "2026-10-20T10:00:00.000Z" }];
  await c.route("**/api/drive/tenant-sms-inbox", (r) => { const { since } = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { ready: true, replies: inbox.filter((m) => !since || m.at > since) } }); });
  const sent = [];
  await c.route("**/api/drive/tenant-sms", (r) => { sent.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { sent: true, to: "***1234", sid: "SM1" } }); });
  const tr = [];
  await c.route("**/api/drive/hpd-translate", (r) => { const b = JSON.parse(r.request().postData() || "{}"); tr.push(b); return r.fulfill({ json: { ai: true, text: b.to === "en" ? "When are you coming to fix the leak?" : ZH } }); });
  await c.route("**/api/drive/hpd-ask", (r) => r.fulfill({ json: { ai: true, text: "Hi, this is Jot from United Angel Construction. HPD sent us for the repair. When can we come? Please text or call back." } }));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const openJob = async (id) => {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.clock.runFor(400);
  };
  // A to-do job with a tenant phone.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let JOB = "", phone = "";
  for (const id of ids.slice(0, 40)) {
    await openJob(id);
    if (await page.locator('[data-hpd-smoke="jc-text-tenant"]').count()) { JOB = id; phone = (await page.locator('[data-hpd-smoke="jc-tenant-call"]').getAttribute("href")).replace(/^tel:/, ""); }
    await page.locator(".fc-job-sheet-close").click();
    if (JOB) break;
  }
  assert.ok(JOB && phone, "a to-do job with a tenant phone");

  // 💬 The tenant texts in Chinese -> remembered for this job, on the phone.
  inbox = [...inbox, { from: `+1${phone.replace(/\D/g, "").slice(-10)}`, body: "你们什么时候来修漏水？", at: new Date(Date.now() + 1000).toISOString() }];
  await page.clock.runFor(125000);
  await page.waitForFunction(() => /in Chinese/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.equal(await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-tenant-lang") || "{}")[j], JOB), "zh");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 📱 Text tenant: written in Chinese, the English below, 中文 on.
  await openJob(JOB);
  await page.locator('[data-hpd-smoke="jc-text-tenant"]').click();
  const draft = page.locator('[data-hpd-smoke="jc-tenant-draft"]');
  const box = page.locator('[data-hpd-smoke="jc-tenant-draft-text"]');
  await page.waitForFunction((zh) => document.querySelector('[data-hpd-smoke="jc-tenant-draft-text"]')?.value === zh, ZH, { timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-tenant-english"]').innerText(), /^In English: Hi, this is Jot .+HPD sent us for the repair/);
  assert.match(await draft.textContent(), /🌐 In 中文, the tenant's language/);
  assert.equal(await page.locator('[data-hpd-smoke="jc-tenant-lang"] button[data-lang="zh"]').getAttribute("aria-pressed"), "true");
  const last = tr[tr.length - 1];
  assert.equal(last.from, "en"); assert.equal(last.to, "zh"); assert.match(last.text, /HPD sent us for the repair/);
  assert.ok(!/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(last.text), "no phone to the translator");

  // A one-tap message goes into Chinese too.
  const before = tr.length;
  await draft.locator('[data-hpd-smoke="jc-tenant-quick-btn"]', { hasText: "On the way" }).click();
  await page.waitForFunction(() => /^In English: .*We are on the way to/.test(document.querySelector('[data-hpd-smoke="jc-tenant-english"]')?.textContent || ""), null, { timeout: 8000 });
  assert.equal(await box.inputValue(), ZH);
  assert.equal(tr.length, before + 1);

  // 📤 Send it now (two taps): the Chinese goes, not translated again.
  await page.locator('[data-hpd-smoke="jc-tenant-send-sms"]').click();
  assert.equal(sent.length, 0, "first tap only arms it");
  await page.locator('[data-hpd-smoke="jc-tenant-send-sms"]').click();
  await page.waitForFunction(() => /✓ Sent/.test(document.querySelector('[data-hpd-smoke="jc-tenant-sms-status"]')?.textContent || ""), null, { timeout: 8000 });
  assert.equal(sent.length, 1); assert.equal(sent[0].text, ZH);
  assert.equal(tr.length, before + 1, "not translated twice");

  // English: the English text back, the language forgotten.
  await page.locator('[data-hpd-smoke="jc-tenant-lang"] button[data-lang="en"]').click();
  await page.waitForFunction(() => /We are on the way to/.test(document.querySelector('[data-hpd-smoke="jc-tenant-draft-text"]')?.value || ""), null, { timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="jc-tenant-english"]').count(), 0);
  assert.equal(await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-tenant-lang") || "{}")[j], JOB), undefined);
  assert.equal(await page.locator('[data-hpd-smoke="jc-tenant-lang"] button[data-lang="en"]').getAttribute("aria-pressed"), "true");

  assert.deepEqual(errors, []);
  console.log("PASS remember the tenant's language: a Chinese text back -> remembered; the next text written in Chinese with the English below; one-tap messages too; sent as Chinese; English forgets it");
} finally {
  await browser.close();
}
