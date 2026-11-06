// 🔎 Check every notice, on an iPhone with test emails: Notices -> "🔎 Check every notice from my email": a notice
// answered with the PDF in ANOTHER email (the stop work notice thread, like ER01720 on 5 Nov) shows "Already sent ...
// Don't send it again"; an unanswered one "Not sent yet", first.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const SENT = "EQ15239", OPEN = "EQ99998";
  const msg = (at, hpd, subject, text, files = []) => ({ at, from: hpd ? "Test Tracker <test.tracker@hpd.nyc.gov>" : "us", hpd, mine: !hpd, subject, text, files });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-72", subject: `72 HR POOR PERFORMANCE NOTICE- OMO#${SENT}`, omos: [SENT], kind: "past due", people: ["Test Tracker"], count: 1, messages: [msg(ago(24 * 6), true, "72", `Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#${SENT}.`, [`72 HR PPN- ${SENT}.pdf`])] },
    { id: "t-stop", subject: `OMO#${SENT}- STOP WORK NOTICE`, omos: [SENT], kind: "paperwork", people: ["Test Tracker"], count: 2, messages: [msg(ago(24 * 5), true, "stop", `Please see attached STOP WORK NOTICE Re: OMO#${SENT}`, [`OMO#${SENT} STOP WORK NOTICE.pdf`]), msg(ago(24 * 4), false, "re", "Please see the attached refused access affidavit and invoice.", [`${SENT} AFF INVOICE.pdf`])] },
    { id: "t-24", subject: `24 HR POOR PERFORMANCE NOTICE- OMO#${OPEN}`, omos: [OPEN], kind: "past due", people: ["Test Tracker"], count: 1, messages: [msg(ago(2), true, "24", `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${OPEN}.`)] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(([day, key]) => {
    try { if (!localStorage.getItem("hpd-said-v1")) localStorage.setItem("hpd-said-v1", JSON.stringify({ day, briefAt: Date.now() - 3600000, said: [{ key, text: `notice ${key.slice(7)} due`, at: Date.now() - 3600000 }] })); } catch { /* private mode */ }
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
  }, [today, `notice:${OPEN}`]);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 1) 🔎 Check every notice.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-check"]').click();
  const list = page.locator('[data-hpd-smoke="fc-notice-check-list"]');
  await list.waitFor({ timeout: 20000 });
  const item = (o) => list.locator(`[data-hpd-smoke="fc-notice-check-item"][data-omo="${o}"]`);
  assert.equal(await item(SENT).getAttribute("data-tone"), "sent");
  const sentText = await item(SENT).innerText();
  assert.match(sentText, new RegExp(`Already sent .*${SENT} AFF INVOICE\.pdf\. Don't send it again`));
  assert.match(sentText, /STOP WORK NOTICE/);
  assert.equal(await item(OPEN).getAttribute("data-tone"), "tosend");
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /^🔎 Checked \d+ notices? from your email: /);
  const firstOmo = await list.locator('[data-hpd-smoke="fc-notice-check-item"]').first().getAttribute("data-tone");
  assert.notEqual(firstOmo, "sent", "what needs doing comes first");

  assert.deepEqual(errors, []);
  console.log("PASS check every notice: sent in another email (the stop work notice) = already sent, don't send again; to send comes first");
} finally {
  await browser.close();
}
