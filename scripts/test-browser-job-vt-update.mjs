// 📣 Update vendor tracking (owner, 9 Nov: "every job card I should have the option to send a message to vendor
// tracking ... Lewis and Saul and Rishi ... we are in touch with this job, we are going here on this day, we'll try to
// get it done ... or this is work in progress, scheduled for next week"). On the job card: one button opens a short
// email to Lewis with Saul and Rishi copied, the "in touch, going on <day>" line already written with the day the job
// is on the route. Nothing goes out before the tap on Send; copies are HPD addresses only.
// And on the notices board (👉 Do this, "tell me just very easily"): an overdue notice whose job is on the route says
// "You go <day>. Tell Lewis" with one button; HPD's send-back ("highlighted errors ... notarized") shows as short fix
// steps with a "Fix it now" link to the correction.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const JOB = "ER02330";
const FIX = "EQ15239";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "numeric", day: "numeric" });
const esc = (t) => t.replace(/[/.]/g, "\\$&");
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const msg = (at, from, text, mine = false, files = []) => ({ at, from, hpd: !mine, mine, subject: "x", text, files });
  const L = "Joy-Ann Lewis <lewis.test@hpd.nyc.gov>";
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-24", subject: `24 HR POOR PERFORMANCE NOTICE- OMO#${JOB}`, omos: [JOB], kind: "past due", people: ["Joy-Ann Lewis"], count: 1, lastAt: ago(80), waiting: true, messages: [msg(ago(80), L, `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${JOB}.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov`)] },
    { id: "t-fix", subject: `72 HR POOR PERFORMANCE NOTICE- OMO#${FIX}`, omos: [FIX], kind: "past due", people: ["Joy-Ann Lewis"], count: 3, lastAt: ago(20), waiting: true, messages: [
      msg(ago(100), L, `Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#${FIX}.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov`),
      msg(ago(60), "me", "Attached.", true, [`${FIX} AFF INVOICE.pdf`]),
      msg(ago(20), L, "Good Day Jot, Kindly see attached affidavit & invoice with highlighted errors. Please make corrections & resubmit. Also note ALL documents are to be legitimately notarized."),
    ] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const mails = [];
  await c.route("**/api/drive/hpd-reply", (r) => { const b = JSON.parse(r.request().postData() || "{}"); mails.push(b); return r.fulfill({ json: { sent: true, to: b.to, cc: b.cc || [] } }); });
  await c.route("**/api/drive/hpd-draft", (r) => r.fulfill({ json: { ai: false, reason: "not-set-up" } }));
  // The job is on today's route: "you go today".
  await c.addInitScript(([d, id]) => { try { localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: d, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: [id] })); } catch { /* private mode */ } }, [today, JOB]);
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});

  // 1) Job card -> 📣 Update vendor tracking.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(JOB).catch(() => {});
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  const vt = page.locator('[data-hpd-smoke="jc-vt"]');
  assert.match(await vt.innerText(), /📣 Update vendor tracking[\s\S]*you go .*in touch · in progress · next week/);
  await vt.click();
  const sheet = page.locator('[data-hpd-smoke="fc-email-sheet"]');
  await sheet.waitFor();
  assert.match(await sheet.locator("header strong").innerText(), new RegExp(`Update vendor tracking · ${JOB}`));
  assert.match(await page.locator('[data-hpd-smoke="fc-email-person"].is-on').innerText(), /Joy-Ann Lewis/);
  assert.ok(await page.locator('[data-hpd-smoke="fc-email-cc-saul"]').isChecked(), "Saul copied");
  assert.ok(await page.locator('[data-hpd-smoke="fc-email-cc-jagdeo"]').isChecked(), "Rishi copied");
  assert.equal(await page.locator('[data-hpd-smoke="fc-email-day"]').inputValue(), today);
  assert.match(await page.locator('[data-hpd-smoke="fc-email-subject"]').inputValue(), new RegExp(`^OMO# ${JOB} - .* - update$`));
  let text = await page.locator('[data-hpd-smoke="fc-email-text"]').inputValue();
  assert.match(text, new RegExp(`^Hi Joy-Ann,\\n\\nWe are in touch on OMO# ${JOB}\\. We are going on ${esc(weekday)} and will try to get it done that day\\.\\n\\nThank you,`), text);
  // Another short line: work in progress.
  await page.locator('[data-hpd-smoke="fc-email-vt-progress"]').click();
  text = await page.locator('[data-hpd-smoke="fc-email-text"]').inputValue();
  assert.match(text, /in progress\. We will send the affidavit and invoice as soon as it is finished\.\n\nThank you,/);
  assert.equal(mails.length, 0, "nothing sent before a tap");
  // Rishi off for this one, then Send: Lewis gets it, Saul a copy.
  await page.locator('[data-hpd-smoke="fc-email-cc-jagdeo"]').uncheck();
  await page.locator('[data-hpd-smoke="fc-email-send"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-email-sheet"]'), null, { timeout: 8000 });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "lewis.test@hpd.nyc.gov");
  assert.deepEqual(mails[0].cc, ["sauld@hpd.nyc.gov"]);
  assert.ok(!/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/.test(JSON.stringify(mails[0])), "no phone numbers in it");

  // 2) Notices board: 👉 Do this.
  await page.goto(`${baseUrl}/map/?view=all&map=1&board=1`, { waitUntil: "load", timeout: 180000 });
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  if (!(await board.waitFor({ timeout: 15000 }).then(() => true).catch(() => false))) {
    for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
    await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
    await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  }
  await board.locator('[data-hpd-smoke="fc-board-row"]').first().waitFor({ timeout: 20000 });
  const late = board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${JOB}"]`);
  const doLate = late.locator('[data-hpd-smoke="fc-board-do"]');
  assert.equal(await doLate.getAttribute("data-action"), "visit");
  assert.match(await doLate.innerText(), /👉 📅 You go .*\. Tell Lewis so the notice is answered\./);
  assert.ok(!(await late.locator('[data-hpd-smoke="fc-board-steps"]').isVisible()), "steps folded under Details");
  await doLate.locator('[data-hpd-smoke="fc-board-do-go"]').click();
  const replyText = await late.locator('[data-hpd-smoke="fc-board-reply-text"]').inputValue();
  assert.match(replyText, new RegExp(`We are in touch with the tenant\\. We are going on ${esc(weekday)} and will try to get the work done that day\\.`), replyText);
  assert.equal(mails.length, 1, "the board only drafts");
  const fixRow = board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${FIX}"]`);
  const doFix = fixRow.locator('[data-hpd-smoke="fc-board-do"]');
  assert.equal(await doFix.getAttribute("data-action"), "correct");
  const fixSteps = await doFix.locator('[data-hpd-smoke="fc-board-fix-steps"] li').allInnerTexts();
  assert.ok(fixSteps.some((s) => /highlighted/.test(s)) && fixSteps.some((s) => /Notary stamp/.test(s)) && /same dates/.test(fixSteps.at(-1)), fixSteps.join(" | "));
  const href = await doFix.locator('[data-hpd-smoke="fc-board-do-go"]').getAttribute("href");
  assert.match(href, new RegExp(`^/paperwork/\\?job=${FIX}&fix=.+&reason=.+notarized.*&vt=1$`));
  assert.match(await board.locator('[data-hpd-smoke="fc-board-fix-count"]').innerText(), /1\s*to fix/);
  // 📋 One status email to Lewis: every open notice of hers, one line each (the day you go when it's set); two taps.
  await board.locator('[data-hpd-smoke="fc-status-open"]').click();
  const sbox = board.locator('[data-hpd-smoke="fc-status-box"]');
  const stext = await sbox.locator('[data-hpd-smoke="fc-status-text"]').inputValue();
  assert.match(stext, /^Hello Joy-Ann,\n\nHere is where each open job stands:\n\n/);
  assert.match(stext, new RegExp(`- OMO# ${FIX}: we are correcting the paperwork you sent back and will resend it\\.`));
  assert.match(stext, new RegExp(`- OMO# ${JOB}: we are in touch with the tenant and going on ${esc(weekday)}\\.`));
  await sbox.locator('[data-hpd-smoke="fc-status-send"]').click();
  assert.equal(mails.length, 1, "first tap only arms");
  await sbox.locator('[data-hpd-smoke="fc-status-send"]').click();
  await sbox.locator('[data-hpd-smoke="fc-status-status"]', { hasText: "Sent to" }).waitFor();
  assert.equal(mails.length, 2);
  assert.equal(mails[1].to, "lewis.test@hpd.nyc.gov");
  assert.match(mails[1].subject, /^Status update: 2 open OMOs/);
  mails.pop(); // the rest of the test counts from here
  // 🔥 Update all overdue in a row: each overdue notice's update written (the day you go when it's set); two taps each.
  const od = board.locator('[data-hpd-smoke="fc-overdue-open"]');
  assert.match(await od.innerText(), /🔥 Update all \d+ overdue in a row \(1 with the day you go\)/);
  await od.click();
  const items = board.locator('[data-hpd-smoke="fc-batch-item"]');
  await items.first().waitFor();
  const mine = items.filter({ hasText: JOB }).first();
  assert.match(await mine.innerText(), /OVERDUE .*you go /);
  assert.match(await mine.locator('[data-hpd-smoke="fc-batch-text"]').inputValue(), /We are in touch with the tenant\. We are going on /);
  assert.equal(await items.first().locator(".fc-batch-to b").innerText().then((t) => t.includes(JOB) || t.includes(FIX)), true, "most overdue first");
  await mine.locator('[data-hpd-smoke="fc-batch-send"]').click();
  assert.equal(mails.length, 1, "first tap only arms");
  await mine.locator('[data-hpd-smoke="fc-batch-send"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="fc-batch-status"]')].some((x) => /Sent to/.test(x.textContent || "")));
  assert.equal(mails.length, 2);
  assert.equal(mails[1].to, "lewis.test@hpd.nyc.gov");
  assert.deepEqual(errors, []);
  console.log(`PASS vendor tracking update: job card 📣 → Lewis with Saul/Rishi copies, "going on ${weekday}" written in, sent only on tap; board 👉 Do this: "You go … Tell Lewis" drafts the day, HPD's send-back shows as fix steps with a Fix it link; 🔥 Update all overdue writes each update with the day and sends on two taps`);
} finally {
  await browser.close();
}
