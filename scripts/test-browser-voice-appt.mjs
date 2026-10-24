// Appointments, reminders and AI-chosen actions by voice (owner, 23 Oct: "AI needs to be smarter, combine all AI ...
// create appointments, remind me, route me, all by talking"), at iPhone size with real jobs. Speech and the AI are faked;
// nothing is texted or sent (texts open Messages for the owner to press Send).
// 1. "make an appointment for EQ15239 tomorrow at 10am" -> asks for a yes -> "yes" saves it on the job, then offers
//    "Text <tenant> the time" (Messages) and "Add to Calendar".
// 2. "remind me to call Lewis at <time>" -> saved; when it's due the app rings with "⏰ Reminder: call lewis".
// 3. A sentence the helper doesn't know -> the AI answers and picks "take me to EQ15239" -> Waze / Google buttons.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const asked = [];
  await c.route(/\/api\/drive\/hpd-ask/, (r) => { const q = JSON.parse(r.request().postData() || "{}"); asked.push(q); return r.fulfill({ json: { ai: true, text: `Sure, heading to your next job.\nDO: take me to ${JOB}` } }); });
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 60); };
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
  const mic = page.locator('[data-hpd-smoke="fc-search-mic"]');
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const say = async (sentence, expect) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.evaluate((s) => { window.__hear = s; }, sentence);
    await mic.click();
    try { await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), expect.source, { timeout: 20000 }); }
    catch { throw new Error(`"${sentence}": got "${await reply.innerText().catch(() => "")}"`); }
    return (await reply.innerText()).trim();
  };

  // 1. Appointment.
  const ask = await say(`make an appointment for ${JOB} tomorrow at 10am`, /Say yes/);
  assert.match(ask, new RegExp(`Appointment at .* \\(${JOB}\\) on \\w{3} \\d\\d/\\d\\d · 10–11 AM`));
  const saved = await say("yes", /Saved:/);
  assert.match(saved, /10–11 AM/);
  const actions = await page.locator('[data-hpd-smoke="fc-agent-action"]').evaluateAll((els) => els.map((e) => ({ text: e.textContent, href: e.getAttribute("href") })));
  assert.ok(actions.some((a) => /Add to Calendar/.test(a.text) && /\/api\/appointment-calendar\?/.test(a.href)), "Add to Calendar");
  const text = actions.find((a) => /^sms:/.test(a.href || ""));
  if (text) assert.match(decodeURIComponent(text.href), /scheduled to come to .* between 10 and 11 AM/);
  const stored = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j]?.Appointment, JOB);
  assert.equal(stored?.start, "10:00");
  assert.equal(stored?.state, "requested");
  if (shots) await page.screenshot({ path: `${shots}/voice-appointment.png` });
  // The list of appointments: tomorrow's shows, with a Waze button.
  const appts = await say("any appointments tomorrow", /appointments? tomorrow:/);
  assert.match(appts, /\w{3} \d\d\/\d\d · 10–11 AM at .*\(not confirmed yet\)/);
  assert.ok((await page.locator('[data-hpd-smoke="fc-agent-action"]').first().getAttribute("href")).includes("waze"), "Waze button");
  await say("appointments today", /No appointments today|appointments? today:/);

  // 2. Reminder (made due right away here instead of waiting).
  const rem = await say("remind me to call Lewis at 4pm", /I'll remind you to call lewis/);
  assert.match(rem, /Add to Calendar/);
  assert.ok((await page.locator('[data-hpd-smoke="fc-agent-action"]').getAttribute("href")).includes("kind=reminder"));
  await page.evaluate(() => { const l = JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]"); l.forEach((r) => { r.date = "2020-01-01"; }); localStorage.setItem("hpd-reminders-v1", JSON.stringify(l)); });
  await page.locator('[data-hpd-smoke="fc-hpd-ping"]', { hasText: "Reminder: call lewis" }).waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]").length), 0, "a reminder rings once");

  // 3. The AI picks an action.
  const routed = await say("I need to head over to my next job now", /Pick Waze or Google/);
  assert.match(routed, /Sure, heading to your next job/);
  assert.match(routed, new RegExp(JOB));
  assert.ok(asked.at(-1).facts.toDoJobs.length > 0, "the AI gets your open jobs");
  assert.ok(!JSON.stringify(asked.at(-1).facts).match(/\(\d{3}\) ?\d{3}-\d{4}|\b\d{3}-\d{3}-\d{4}\b/), "no phone numbers go to the AI");
  if (shots) await page.screenshot({ path: `${shots}/voice-ai-action.png` });

  // 4. The AI remembers what was just said (follow-ups).
  await say("and after that I want to see the one after it", /Pick Waze or Google|Sure/);
  const conv = asked.at(-1).facts.recentConversation;
  assert.ok(conv.length >= 1 && /head over to my next job/.test(conv.at(-1).you), "the AI gets the last question");
  assert.match(conv.at(-1).helper, /did: take me to/);

  // 5. Money: what PIP shows HPD still owes.
  const owed = await say("how much does HPD owe me", /HPD owes you \$[\d,]+ on \d+ jobs? in PIP|PIP shows nothing owed/);
  console.log(`  money: ${owed.slice(0, 160)}`);
  // Rejections holding money, the ones to fix first, with Fix buttons.
  const rej = await say("which rejections do I have", /rejections? hold \$[\d,]+|No payment rejections/);
  console.log(`  rejections: ${rej.slice(0, 160)}`);
  if (/to fix/.test(rej)) assert.match(await page.locator('[data-hpd-smoke="fc-agent-action"]').first().innerText(), /▶ Fix them one by one \(\d+\)/);
  if (/to fix/.test(rej)) assert.match(await page.locator('[data-hpd-smoke="fc-agent-action"]').first().getAttribute("href"), /^\/paperwork\/\?job=[A-Z]{2}\d{5}&fix=.*&auto=1$/);

  // 6. A job start to finish: the appointment made above shows as done, and what's left comes next.
  const status = await say(`what's left on ${JOB}`, new RegExp(`${JOB} at .*Done:`));
  assert.match(status, /appointment \w{3} \d\d\/\d\d/);
  assert.match(status, /Left: /);
  console.log(`  status: ${status.slice(0, 200)}`);

  // 7. The week in one answer.
  const week = await say("how did I do this week", /This week you won \d+ jobs?, sent \d+ bids?, finished \d+ jobs?, sent paperwork for \d+/);
  console.log(`  week: ${week.slice(0, 200)}`);

  // 7b. A call to the tenant, said after it: no answer -> noted + a reminder for tomorrow 10 AM; they gave a time ->
  // offered as the appointment.
  await say(`I called the tenant for ${JOB}, no answer`, /Noted: no answer at .* call again tomorrow at 10/);
  const rems = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-reminders-v1") || "[]"));
  assert.ok(rems.some((r) => r.time === "10:00" && new RegExp(`call the tenant at .* again \\(${"EQ15239"}\\)`).test(r.what)), "reminder to call again");
  const callRec = await page.evaluate((j) => JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j], JOB);
  assert.equal(callRec?.TenantCallResult, "no-answer");
  await say(`I called the tenant for ${JOB}, they said Friday at 2pm`, /Make the appointment at .* on Fri \d\d\/\d\d · 2–3 PM\?/);
  await say("no", /nothing saved/i);
  // The job card lists every contact with the tenant, newest first.
  await say(`open ${JOB}`, /Here's/);
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  const history = page.locator('[data-hpd-smoke="jc-tenant-history"]');
  await history.waitFor({ timeout: 10000 });
  const lines = await history.locator("li").allInnerTexts();
  assert.match(lines[0], /Talked to the tenant: Friday at 2pm/, "newest first");
  assert.ok(lines.some((l) => /Called the tenant: no answer/.test(l)), "the no-answer call");
  assert.ok(lines.some((l) => /Appointment requested/.test(l)), "the appointment");

  // 8. "What can you do" -> examples by topic; tapping one runs it.
  await say("what can you do", /Here's what you can say/);
  const examples = page.locator('[data-hpd-smoke="fc-agent-example"]');
  assert.ok(await examples.count() >= 10, "examples to tap");
  await examples.filter({ hasText: "how much does HPD owe me" }).click();
  await page.waitForFunction(() => /HPD owes you|PIP shows nothing owed/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 20000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-help"]').count(), 0, "the list folds away after a tap");
  // 9. "Fix them one by one" from the rejections answer: the paperwork page opens on the first, counting 1 of N.
  const rej2 = await say("which rejections do I have", /rejections? hold|No payment rejections/);
  if (/to fix/.test(rej2)) {
    await page.locator('[data-hpd-smoke="fc-agent-action"]').first().click();
    await page.locator('[data-hpd-smoke="paperwork-fix-progress"]').waitFor({ timeout: 60000 });
    assert.match(await page.locator('[data-hpd-smoke="paperwork-fix-progress"]').innerText(), /Fixing one by one · 1 of \d+/);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS voice appointments: "${JOB} tomorrow at 10am" -> yes -> saved 10–11 AM with Text the tenant + Add to Calendar; "remind me to call Lewis at 4pm" -> rings when due; a free sentence -> the AI picked "take me to ${JOB}" -> Waze / Google; the AI gets the last turns for follow-ups; "how much does HPD owe me" answered from PIP`);
  await c.close();
} finally {
  await browser.close();
}
