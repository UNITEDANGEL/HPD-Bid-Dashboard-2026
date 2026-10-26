// After a call from the app (26 Oct) at iPhone size with real jobs: tap 📞 Call on a job card, come back to the app ->
// "How did the call go?" -> No answer notes it on the job (TenantCallResult) and sets a reminder to call again
// tomorrow at 10 AM. Nothing is dialed in the test (the phone call itself is the iPhone's).
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
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // A to-do job with a tenant phone.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let JOB = "";
  for (const id of ids.slice(0, 40)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    if (await page.locator('[data-hpd-smoke="jc-tenant-call"]').count()) { JOB = id; break; }
    await page.locator(".fc-job-sheet-close").click();
  }
  assert.ok(JOB, "a to-do job with a tenant phone");
  // The tel: link itself goes to the phone app; here it's stopped so the page stays.
  await page.evaluate(() => document.addEventListener("click", (e) => { const a = e.target.closest?.('a[href^="tel:"]'); if (a) e.preventDefault(); }, true));
  await page.locator('[data-hpd-smoke="jc-tenant-call"]').click();
  // Away on the call, then back.
  await page.waitForTimeout(3500);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  const ask = page.locator('[data-hpd-smoke="fc-call-ask"]');
  await ask.waitFor({ timeout: 10000 });
  assert.match(await ask.innerText(), new RegExp(`How did the call to .* go\\?[\\s\\S]*${JOB}`));
  if (shots) await page.screenshot({ path: `${shots}/call-ask.png` });
  await ask.locator('[data-hpd-smoke="fc-call-noanswer"]').click();
  await page.waitForFunction(() => /Noted: no answer at .* call again tomorrow at 10/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  const rec = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j], JOB);
  assert.equal(rec?.TenantCallResult, "no-answer");
  const rems = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]"));
  assert.ok(rems.some((r) => r.time === "10:00" && r.what.includes(JOB)), "call-again reminder");
  assert.equal(await ask.count(), 0, "the card goes away");
  assert.deepEqual(errors, []);
  console.log(`PASS after the call: 📞 Call on ${JOB} -> back in the app "How did the call go?" -> No answer noted on the job and a reminder for tomorrow 10 AM`);
  await c.close();
} finally {
  await browser.close();
}
