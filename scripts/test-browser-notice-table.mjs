// 📋 Every notice + 🧹 old jobs, on an iPhone (owner, 6 Nov): Notices -> The list -> "📋 Every notice": each job with
// its number and address, the to-do ones first, the sent ones folded away, the emails behind a tap. The map's 🧹
// button lists old jobs with nothing on file (ER02772); ✅ Closed takes one off.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const SENT = "EQ15239", OPEN = "ER02330";
  const msg = (at, hpd, subject, text, files = []) => ({ at, from: hpd ? "Test Tracker <test.tracker@hpd.nyc.gov>" : "us", hpd, mine: !hpd, subject, text, files });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-72", subject: `72 HR POOR PERFORMANCE NOTICE- OMO#${SENT}`, omos: [SENT], kind: "past due", people: ["Test Tracker"], count: 2, lastAt: ago(24 * 5), waiting: false, messages: [msg(ago(24 * 6), true, "72", `Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#${SENT}.`), msg(ago(24 * 5), false, "re", "Attached.", [`${SENT} AFF INVOICE.pdf`])] },
    { id: "t-24", subject: `24 HR POOR PERFORMANCE NOTICE- OMO#${OPEN}`, omos: [OPEN], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: ago(2), waiting: true, messages: [msg(ago(2), true, "24", `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${OPEN}.`)] },
  ] }) });
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") posted.push(r.request().postData() || ""); return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  // ☎️ What HPD said last on a call, saved on the job (the helper saves "HPD said ..." like this).
  await c.addInitScript((omo) => { localStorage.setItem("hpd-job-notes", JSON.stringify({ [omo]: [{ text: "☎️ HPD call Nov 5: they want the after photos by Friday", at: "2026-11-05T15:00:00Z" }, { text: "gate code 1234", at: "2026-11-05T16:00:00Z" }] })); }, "ER02330");
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // 1) 🧹 Old jobs: ER02772 (due 9/17, nothing on file) is off the map and in the list; ✅ Closed takes it off.
  const stale = page.locator('[data-hpd-smoke="fc-stale-open"]');
  await stale.waitFor({ timeout: 20000 });
  // It says what it is (owner, 10 Nov: "what is the mailbox with 3 on the right?"): the count, then "old".
  assert.match((await stale.innerText()).replace(/\s+/g, " "), /🧹 \d+ old/, "the 🧹 tab reads N old");
  await stale.click();
  const row = page.locator('[data-hpd-smoke="fc-stale-row"][data-omo="ER02772"]');
  await row.waitFor({ timeout: 10000 });
  assert.match(await row.innerText(), /172-17 JAMAICA AVENUE/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-stale-row"][data-omo="ER09516"]').count(), 0, "a new job isn't old");
  await row.locator('[data-hpd-smoke="fc-stale-closed"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-stale-row"][data-omo="ER02772"]'), null, { timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-stale-close"]').click();

  // 2) 📋 Every notice: number + address, to-do first, sent folded, emails folded.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-pick-list"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-dept-vendor"] .fc-notice-dept-head').click();
  await page.locator('[data-hpd-smoke="fc-notice-tab-requests"]').click();
  const table = page.locator('[data-hpd-smoke="fc-notice-table"]');
  await table.waitFor({ timeout: 15000 });
  const open = table.locator(`[data-hpd-smoke="fc-notice-table-row"][data-omo="${OPEN}"]`);
  assert.equal(await open.getAttribute("data-tone"), "tosend");
  assert.match(await open.locator('[data-hpd-smoke="fc-notice-table-address"]').innerText(), /1020 BOYNTON AVENUE/);
  assert.equal(await open.locator('[data-hpd-smoke="fc-notice-table-call"]').innerText(), "☎️ HPD call Nov 5: they want the after photos by Friday");
  assert.ok(await open.isVisible());
  const sent = table.locator(`[data-hpd-smoke="fc-notice-table-row"][data-omo="${SENT}"]`);
  assert.equal(await sent.isVisible(), false, "already sent: folded away");
  await table.locator('[data-hpd-smoke="fc-notice-table-sent"] > summary').click();
  assert.ok(await sent.isVisible());
  assert.match(await sent.innerText(), /Already sent .*Don't send it again/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-notices-emails"]').getAttribute("open"), null, "the emails are folded");

  assert.deepEqual(errors, []);
  console.log("PASS every notice: number + address, what HPD said on the last call, to-do first, sent folded, emails folded; 🧹 old jobs listed and ✅ Closed takes one off");
} finally {
  await browser.close();
}
