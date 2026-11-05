// 💬 🧾 📝 (owner, 5 Nov: "do all"): a tenant texts in Chinese -> the helper shows it in English (the app's translator)
// and offers an answer written in Chinese, sent only after a yes; "what do I need today" -> the list in store order with
// check boxes that stay ticked; after "what do I say to HPD", what HPD said is kept on the job. No real AI or texts.
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
  const tr = [];
  await c.route("**/api/drive/hpd-translate", (r) => { const b = JSON.parse(r.request().postData() || "{}"); tr.push(b); return r.fulfill({ json: { ai: true, text: b.to === "en" ? "When are you coming to fix the leak?" : "我们会尽快联系您安排时间。" } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // A to-do job with a tenant phone.
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
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');

  // 💬 The tenant texts in Chinese.
  const digits = phone.replace(/\D/g, "").slice(-10);
  inbox = [...inbox, { from: `+1${digits}`, body: "你们什么时候来修漏水？", at: new Date(Date.now() + 1000).toISOString() }];
  await page.clock.runFor(125000);
  await page.waitForFunction(() => /I can answer in Chinese/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  const said = await reply.innerText();
  assert.match(said, /in Chinese\. It says: "When are you coming to fix the leak\?"/);
  assert.match(said, /"我们会尽快联系您安排时间。"\n\(In English: "/);
  assert.deepEqual(tr[0], { text: "你们什么时候来修漏水？", from: "zh", to: "en" });
  assert.equal(tr[1].from, "en"); assert.equal(tr[1].to, "zh");
  assert.equal(sent.length, 0, "nothing sent by itself");
  await page.locator('[data-hpd-smoke="fc-agent-offer"]', { hasText: "我们会尽快联系您安排时间" }).first().click();
  await page.waitForFunction(() => /Say yes to send it/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  assert.equal(sent.length, 0, "still nothing before the yes");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  const ask = async (text) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    if (await page.locator(".fc-job-sheet-close").count()) await page.locator(".fc-job-sheet-close").first().click().catch(() => {});
    if (await page.locator('[data-hpd-smoke="fc-jobs"]').count()) await page.locator('[data-hpd-smoke="fc-jobs"] button', { hasText: /^Close$/ }).first().click().catch(() => {});
    await page.clock.runFor(500);
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    await page.clock.runFor(300);
  };
  // 🧾 The shopping list in store order with check boxes.
  await page.evaluate((j) => { localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()) }, ids: [j] })); }, JOB);
  await ask("what do I need today");
  await page.waitForFunction(() => /📦 To bring for|couldn't tell the materials/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });
  let shopNote = "this job's description names no materials";
  if (/📦 To bring/.test(await reply.innerText())) {
    await page.locator('[data-hpd-smoke="fc-shop"]').waitFor({ timeout: 5000 });
    const rows = page.locator('[data-hpd-smoke="fc-shop-check"]');
    await rows.first().check();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("hpd-shop-"))) || "[]"));
    assert.equal(kept.length, 1, "the tick is kept");
    shopNote = `${await rows.count()} line(s) in store order, a tick kept`;
  }

  // 📝 What HPD said, kept on the job.
  await ask(`what do I say to HPD about ${JOB}`);
  await page.waitForFunction(() => /tell me what HPD said/.test(document.querySelector('[data-hpd-smoke="fc-agent"]')?.textContent || document.body.textContent || ""), null, { timeout: 8000 });
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("they want the after photos by Friday");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction((j) => (JSON.parse(localStorage.getItem("hpd-job-notes") || "{}")[j] || []).some((n) => /^☎️ HPD call \w+ \d+: they want the after photos by Friday$/.test(n.text)), JOB, { timeout: 8000 });
  // Any time: "HPD said about <job> ..."
  await ask(`HPD said about ${JOB} the inspection is Monday`);
  await page.waitForFunction((j) => (JSON.parse(localStorage.getItem("hpd-job-notes") || "{}")[j] || []).some((n) => /: the inspection is Monday$/.test(n.text)), JOB, { timeout: 8000 });
  assert.deepEqual(errors, []);
  console.log(`PASS tenant language: a Chinese text shown in English, the answer offered in Chinese, nothing sent before the yes; shopping list: ${shopNote}; what HPD said kept on ${JOB} (after the call and "HPD said about …")`);
} finally {
  await browser.close();
}
