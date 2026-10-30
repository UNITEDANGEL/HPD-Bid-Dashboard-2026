// Refused access questions on the job card (owner, 30 Oct: "add the refused access questions on the job card; the invoice
// date is the same as the refused access date ... I'm closing a refused access today but it was in the past"; "only the
// refused access date and the person's description") at iPhone size: Refused access asks just the date (a past day) and
// the description (required); saved with that day; the affidavit page opens with that date and the description; Work
// completed asks the date too. Status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const PAST = (() => { const d = new Date(Date.now() - 6 * 86400000); return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d); })();
const [py, pm, pd] = PAST.split("-");
const SHORT = `${pm}/${pd}/${py.slice(2)}`;
const posted = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { posted.push(r.request().postData() || ""); return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"]').fill(JOB);
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  // Arrive, start the visit, then Refused access.
  await page.locator('[data-hpd-smoke="jc-step-arrived"]').click();
  await page.locator('[data-hpd-smoke="jc-step-visit"]').click();
  await page.locator("#fc-job-card .jc-step-choices button", { hasText: "Refused access" }).click();
  const q = page.locator('[data-hpd-smoke="jc-refused-questions"]');
  await q.waitFor({ timeout: 10000 });
  // When: today by default, a past day picked.
  const date = page.locator('[data-hpd-smoke="jc-outcome-date"]');
  assert.equal(await date.inputValue(), new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()));
  await date.fill(PAST);
  assert.match(await page.locator("#fc-job-card .jc-outcome-date small").innerText(), /A past day/);
  // Who is required.
  await page.locator('[data-hpd-smoke="jc-step-save-outcome"]').click();
  await page.getByText("Describe who refused access first").first().waitFor({ timeout: 5000 });
  await q.locator("button", { hasText: "Male, tall, dark hair" }).click();
  assert.equal(await q.locator("input").count(), 1, "only the description (and the date) asked");
  if (shots) await page.locator('[data-hpd-smoke="jc-refused-questions"]').screenshot({ path: `${shots}/refused-questions.png` });
  await page.locator('[data-hpd-smoke="jc-step-save-outcome"]').click();
  await page.waitForFunction((j) => (JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j] || {}).FieldOutcome === "REFUSED_ACCESS", JOB, { timeout: 10000 });
  const saved = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j], JOB);
  assert.equal(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(saved.RefusalDate)), PAST, "saved on the past day");
  assert.equal(saved.DeniedDescription, "MALE, TALL, DARK HAIR");
  for (let i = 0; i < 20 && !posted.some((p) => p.includes("REFUSED_ACCESS")); i++) await page.waitForTimeout(250);
  assert.ok(posted.some((p) => p.includes("REFUSED_ACCESS")), "outcome on the status server");
  // The affidavit: that date and the description.
  await page.goto(`${baseUrl}/paperwork/?job=${JOB}&outcome=REFUSED_ACCESS`, { waitUntil: "load", timeout: 180000 });
  const card = page.locator('[data-hpd-smoke="paperwork-date-card"]');
  await card.waitFor({ timeout: 60000 });
  await page.waitForFunction((s) => (document.querySelector('[data-hpd-smoke="paperwork-date-card"]')?.textContent || "").includes(s), SHORT, { timeout: 20000 });
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-refused-date"]').inputValue(), PAST);
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-refused-who"]').inputValue(), "MALE, TALL, DARK HAIR", "description on the affidavit");
  // One card, in order: 1. date, 2. who; the rest folded away; the invoice goes with it on that date.
  const cardText = await card.innerText();
  assert.ok(cardText.indexOf("1. Date refused") < cardText.indexOf("2. Person who refused"), cardText);
  assert.match(cardText, new RegExp(`invoice is made with this affidavit, dated ${SHORT.replace(/\//g, "\/")}`, "i"));
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-refused-more"]').getAttribute("open"), null, "name / relationship / phone folded");
  if (shots) await card.screenshot({ path: `${shots}/refused-card.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS refused access questions: just the date (past day ${PAST}) and the description (required) on the job card; saved with that day; the affidavit opens with ${SHORT} and the description`);
  await c.close();
} finally {
  await browser.close();
}
