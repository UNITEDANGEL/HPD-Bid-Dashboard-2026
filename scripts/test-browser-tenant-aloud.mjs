// 📱 Tenant texts out loud (plan item 22), driving, text service on (faked; nothing really sent): a tenant's text is
// read out, the helper listens, "tell her we'll be there at 10" is read back, and it goes only after "yes".
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
  const said = [];
  await c.exposeFunction("__said", (t) => said.push(t));
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said?.(u.text); setTimeout(() => u.onend?.(), 30); };
    window.__queue = [];
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const t = window.__queue.shift(); if (t) this.onresult?.({ results: [Object.assign([{ transcript: t }], { isFinal: true })] }); this.onend?.(); }, 150); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
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
  const until = async (re, what) => {
    for (let i = 0; i < 60; i++) { if (re.test(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText().catch(() => ""))) return; await page.clock.runFor(1000); }
    throw new Error(`waited for ${what}: ${await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText().catch(() => "")}`);
  };
  // Driving mode on (it says so and keeps listening).
  if (await page.locator('[data-hpd-smoke="fc-jobs"]').count()) await page.keyboard.press("Escape");
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("driving mode on");
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').press("Enter");
  await until(/Driving mode on/, "driving mode");
  // The tenant texts; it's read out loud.
  inbox = [...inbox, { from: `+1${phone.replace(/\D/g, "").slice(-10)}`, body: "Who is this?", at: new Date(Date.now() + 1000).toISOString() }];
  await page.clock.runFor(125000);
  await until(/texted back about/, "the text");
  assert.ok(said.some((t) => /texted back: Who is this\?/.test(t)), "read out loud");
  // Answer by voice: read back, nothing sent before the yes.
  await page.evaluate(() => { window.__queue.push("tell her we'll be there at 10"); });
  await until(/Say yes to send it/, "the read-back");
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /We'll be there at 10\./);
  assert.equal(sent.length, 0, "nothing sent before the yes");
  await page.evaluate(() => { window.__queue.push("yes"); });
  await until(/^Sent\./, "sent");
  assert.equal(sent.length, 1, "sent once, after the yes");
  assert.deepEqual(errors, []);
  console.log("PASS tenant texts out loud: the text is read, it listens, your answer is read back and sent only after yes");
} finally {
  await browser.close();
}
