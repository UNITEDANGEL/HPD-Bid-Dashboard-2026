// Tenant contact first on the job card (owner, 29 Oct: "the first thing I need to do on the job is to contact the
// tenant; once we made contact it should log it; even if no answer; what we send through the app logs on the job card
// permanently"). iPhone size, real jobs: the 👤 box sits right under the address; 📞 Call writes "Called the tenant"
// on the job the moment it's tapped; No answer replaces it (one line per call); 📱 Text from the phone logs
// "Texted the tenant"; Talked turns the box green. Every line goes to the status server and is still there after a
// reload. Nothing is dialed or texted in the test.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const posted = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { try { posted.push(r.request().postDataJSON()); } catch { /* not JSON */ } return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await c.addInitScript(() => {
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { const text = window.__hear || ""; if (text) this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] }); this.onend?.(); }, 100); }
      stop() { this.onend?.(); }
    };
    // tel: / sms: go to the phone's apps; here they're stopped so the page stays.
    document.addEventListener("click", (e) => { const a = e.target.closest?.('a[href^="tel:"], a[href^="sms:"]'); if (a) e.preventDefault(); }, true);
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const openMap = async () => {
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  };
  const openJob = async (id) => {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
  };
  await openMap();
  // A to-do job with a tenant phone (not a common area: those have no Text button).
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let JOB = "";
  for (const id of ids.slice(0, 40)) {
    await openJob(id);
    if (await page.locator('[data-hpd-smoke="jc-contact-text"]').count()) { JOB = id; break; }
    await page.locator(".fc-job-sheet-close").click();
  }
  assert.ok(JOB, "a to-do job with a tenant phone");
  // The Jobs list shows the tenant on every to-do job (29 Oct), with a button for the ones not reached yet.
  const rowChip = async () => {
    await page.locator(".fc-job-sheet-close").click();
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    const t = await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] [data-hpd-smoke="fc-jobs-contact"]`).innerText();
    return t;
  };
  const chip0 = await rowChip();
  assert.match(chip0, /🔴 Call the tenant first|🟡 Not reached yet|✅ Tenant reached/);
  const reach = page.locator('[data-hpd-smoke="fc-jobs-reach"]');
  assert.match(await reach.innerText(), /📞 Tenant not reached yet: \d+/);
  await reach.click();
  const onlyRows = await page.locator('[data-hpd-smoke="fc-jobs-row"] [data-hpd-smoke="fc-jobs-contact"]').allInnerTexts();
  assert.ok(onlyRows.length && onlyRows.every((t) => /🔴|🟡/.test(t)), "only tenants not reached");
  if (shots) await page.screenshot({ path: `${shots}/contact-0-list.png` });
  // ▶ Start calling (30 Oct) opens the first tenant on that list.
  const start = page.locator('[data-hpd-smoke="fc-jobs-startcall"]');
  const FIRST = await start.getAttribute("data-omo");
  assert.ok(FIRST && ids.includes(FIRST), "first tenant to call");
  await start.click();
  await page.waitForFunction((n) => (document.querySelector("#fc-job-card")?.textContent || "").includes(n), FIRST, { timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-contact-status"]').innerText(), /🔴|🟡/);
  await page.locator(".fc-job-sheet-close").click();
  await openJob(JOB);
  const box = page.locator('[data-hpd-smoke="jc-contact"]');
  // First on the card: right under the address, before the job description.
  assert.ok(await page.evaluate(() => {
    const b = document.querySelector('[data-hpd-smoke="jc-contact"]'), d = document.querySelector('[data-hpd-smoke="jc-description"]'), h = document.querySelector("#fc-job-card .jc-hero");
    return !!(b && d && h && (h.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && (b.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), "the contact box is between the address and the job");
  const call = box.locator('[data-hpd-smoke="jc-contact-call"]');
  assert.match(await call.innerText(), /📞 Call /);
  assert.match(await call.getAttribute("href"), /^tel:/);
  const lines = async () => (await box.locator('[data-hpd-smoke="jc-tenant-history"]').count() ? box.locator('[data-hpd-smoke="jc-tenant-history"] li').allInnerTexts() : []);
  const total = () => page.evaluate((j) => (JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j]?.FieldVisitHistory || []).filter((v) => /tenant/i.test(v.note || "")).length, JOB);
  const startCount = await total();
  if (shots) await page.screenshot({ path: `${shots}/contact-1-first.png` });

  // 📞 Call: on the job right away, even before knowing how it went.
  await call.click();
  await page.waitForFunction(() => /Called the tenant/.test(document.querySelector('[data-hpd-smoke="jc-tenant-history"] li')?.textContent || ""), null, { timeout: 10000 });
  assert.match((await lines())[0], /📞 Called the tenant/);
  assert.match(await box.locator('[data-hpd-smoke="jc-contact-status"]').innerText(), /Not reached yet · \d+ tr(y|ies)/);
  await box.locator('[data-hpd-smoke="jc-contact-ask"]').waitFor({ timeout: 5000 });
  assert.equal(await total(), startCount + 1);
  if (shots) await page.screenshot({ path: `${shots}/contact-2-called.png` });

  // No answer: it takes the place of "Called the tenant" (one line for the call) and a call-again reminder is set.
  await box.locator('[data-hpd-smoke="jc-contact-noanswer"]').click();
  await page.waitForFunction(() => /Called the tenant: no answer/.test(document.querySelector('[data-hpd-smoke="jc-tenant-history"] li')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(await total(), startCount + 1, "one line per call");
  assert.equal(await box.locator('[data-hpd-smoke="jc-contact-ask"]').count(), 0);
  const rems = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]"));
  assert.ok(rems.some((r) => r.time === "10:00" && r.what.includes(JOB)), "call-again reminder");
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 📱 Text from the phone's Messages: logged as soon as Messages opens.
  await box.locator('[data-hpd-smoke="jc-contact-text"]').click();
  const openSms = page.locator('[data-hpd-smoke="jc-tenant-open-sms"]');
  await openSms.waitFor({ timeout: 15000 });
  // A professional first text: who we are, HPD's work order, and the job summary (29 Oct).
  const draft = await page.locator('[data-hpd-smoke="jc-tenant-draft-text"]').inputValue();
  assert.ok(draft.includes("the contractor NYC HPD assigned to the repair at ") && draft.includes(`(HPD work order ${JOB}). The work: `), draft);
  await openSms.click();
  await page.waitForFunction(() => /Texted the tenant/.test(document.querySelector('[data-hpd-smoke="jc-tenant-history"] li')?.textContent || ""), null, { timeout: 10000 });
  assert.equal(await total(), startCount + 2);
  assert.match((await lines())[0], /📱 Texted the tenant the job summary: \S/);
  assert.match((await lines()).join("\n"), /Called the tenant: no answer/);

  // Every line went to the status server (other phones, and kept for good).
  // (The outbox goes out a moment after each change.)
  for (let i = 0; i < 40 && !JSON.stringify(posted).includes("Texted the tenant"); i++) await page.waitForTimeout(250);
  const sent = JSON.stringify(posted);
  assert.ok(sent.includes(JOB) && sent.includes("Called the tenant: no answer") && sent.includes("Texted the tenant"), "on the status server");

  // Still there after a reload.
  await openMap();
  await openJob(JOB);
  const after = (await lines()).join("\n");
  assert.match(after, /Texted the tenant/);
  assert.match(after, /Called the tenant: no answer/);

  // Call again, Talked -> green "Reached".
  await page.locator('[data-hpd-smoke="jc-contact-call"]').click();
  await page.locator('[data-hpd-smoke="jc-contact-talked"]').click();
  await page.waitForFunction(() => /✅ Reached/.test(document.querySelector('[data-hpd-smoke="jc-contact-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-contact"]').getAttribute("class"), /is-ok/);
  assert.match((await lines())[0], /Talked to the tenant/);
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="jc-contact"]').scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/contact-3-reached.png` });
  // Reached -> book the visit: the appointment editor opens (or, already booked, the box says when).
  const book = page.locator('[data-hpd-smoke="jc-contact-book"]');
  if (await book.count()) {
    await book.click();
    await page.locator("#fc-job-card .fc-appointment-editor").waitFor({ timeout: 10000 });
  } else assert.match(await page.locator('[data-hpd-smoke="jc-contact-appt"]').innerText(), /📅 Appointment /, "already booked: the box says when");
  assert.equal(await rowChip(), "✅ Tenant reached", "the list shows it too");
  // ➡️ Next tenant to call (30 Oct): after logging this one, one tap opens the next tenant not reached yet.
  await openJob(JOB);
  const nextBtn = page.locator('[data-hpd-smoke="jc-contact-next"]');
  assert.match(await nextBtn.innerText(), /➡️ Next tenant to call · \d+ left/);
  const NEXT = await nextBtn.getAttribute("data-omo");
  assert.ok(NEXT && NEXT !== JOB, "a different job");
  await nextBtn.click();
  await page.waitForFunction((n) => (document.querySelector("#fc-job-card")?.textContent || "").includes(n), NEXT, { timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-contact-status"]').innerText(), /🔴|🟡/, "the next one isn't reached yet");
  assert.equal(await page.locator('[data-hpd-smoke="jc-contact-next"]').count(), 0, "no Next until this one is logged");
  if (shots) await page.screenshot({ path: `${shots}/contact-4-next.png` });
  // By voice (30 Oct): "next tenant" opens the one after that.
  await page.evaluate(() => { window.__hear = "next tenant"; });
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  await page.waitForFunction(() => /Next tenant: .+, \d+ left\./.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  await page.waitForFunction((n) => { const t = document.querySelector("#fc-job-card")?.textContent || ""; return t && !t.includes(n); }, NEXT, { timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-contact-status"]').innerText(), /🔴|🟡/, "by voice: another tenant not reached yet");
  assert.deepEqual(errors, []);
  console.log(`PASS tenant contact on ${JOB}: box first under the address; Call logged at once, No answer took its place + reminder; Text from Messages logged; on the status server and after a reload; Talked -> ✅ Reached, the Jobs list chip + 📞 Not reached filter, ▶ Start calling, ➡️ Next tenant to call and \"next tenant\" by voice`);
  await c.close();
} finally {
  await browser.close();
}
