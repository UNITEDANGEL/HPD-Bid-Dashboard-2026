// 🧠 A smarter robot (owner, 4 Nov: "it should be able to answer any questions I have for my app") at iPhone size, the
// AI faked: 1) a real question that is close to a known phrase still goes to the AI (not a near-miss answer), with
// this week's numbers, the bids sent, all jobs by stage and today's bids. 2) A question naming a job sends that job in
// full. 3) A question about the app sends the newest changes too. The answer is shown and said.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const asked = [];
  await c.route(/\/api\/drive\/hpd-ask/, (r) => { const b = JSON.parse(r.request().postData() || "{}"); asked.push(b); return r.fulfill({ json: { ai: true, text: /doing/.test(b.question) ? `Answer ${asked.length}.
ASK: Which bids did I lose this month?
ASK: Which notice is the oldest?` : `Answer ${asked.length}.` } }); });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
    localStorage.setItem("hpd-job-notes", JSON.stringify({ ER06362: [{ text: "Tenant said the dog bites, call first.", at: "2026-11-01T12:00:00Z" }] }));
    localStorage.setItem("hpd-chat-notes", JSON.stringify([{ text: "I always bid door closers at 450", at: "2026-11-01T12:00:00Z" }]));
    localStorage.setItem("hpd-bid-records-v1", JSON.stringify({ ER77777: { omo: "ER77777", address: "1 Test St", bidDue: "2026-11-04", price: 1200, sentPrice: 1200, status: "confirmed", sentAt: new Date().toISOString(), savedAt: new Date().toISOString(), attempts: 1, updatedAt: new Date().toISOString() } }));
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  const ask = async (q, n) => {
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(q);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    await page.waitForFunction((k) => (document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").includes(`Answer ${k}.`), n, { timeout: 15000 }).catch(async (e) => { throw new Error(`"${q}" got: ${await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText().catch(() => "no chat")}`); });
    await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  };

  // 1) Close to "how did I do this week", but a real question: the AI answers it, with the numbers.
  await ask("How many bids did I send to HPD this week and how many jobs did I finish?", 1);
  const f1 = asked[0].facts;
  assert.equal(f1.bidsSent.last7Days, 1);
  assert.equal(f1.bidsSent.latest[0].job, "ER77777");
  assert.equal(f1.bidsSent.latest[0].price, 1200);
  assert.ok(f1.numbers && typeof f1.numbers.thisWeek.completed === "number", "this week's numbers");
  assert.ok(Object.keys(f1.allJobsByStage).length > 0, "all jobs by stage");
  assert.ok("stillToSend" in f1.bidsDueToday);

  // 🧠 What it was told to remember and 📈 the last 3 months go along.
  assert.equal(f1.myNotes[0].note, "I always bid door closers at 450");
  assert.equal(f1.trends.length, 3);
  assert.ok(f1.trends.every((m) => /^\d{4}-\d{2}$/.test(m.month) && typeof m.jobsWon === "number" && typeof m.bidsSent === "number"));
  assert.equal(f1.trends[0].bidsSent, 1, "this month's sent bid");
  assert.deepEqual(f1.hpdEmails, [], "no email text unless asked about emails");
  // 2) A job named in the question goes in full.
  await ask("Is ER06362 finished yet, and what is left to do there?", 2);
  const named = asked[1].facts.jobsNamed;
  assert.equal(named[0].job, "ER06362");
  assert.equal(named[0].found !== false, true);
  assert.ok(named[0].address && named[0].work, "address and work");

  // 📩 About emails: HPD's newest emails go along in full (a list, empty when there are none on this phone).
  await ask("What did Lewis say in her last email about my notices?", 3);
  assert.ok(Array.isArray(asked[2].facts.hpdEmails));
  // 4) About the app: the newest changes go along.
  await ask("How do I change the robot's voice in the app?", 4);
  assert.ok(asked[3].facts.appChanges.length > 5, "the newest changes");
  assert.ok(await page.evaluate(() => window.__said.some((t) => /Answer 4/.test(t))), "said out loud");
  // 💬📊 "How am I doing": bars for 3 months and the next questions as buttons.
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("How am I doing compared to last month?");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-chart"]').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-chart"] .fc-agent-chart-col').count(), 3);
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-chart"]').getAttribute("aria-label"), /Bids sent and jobs won: .*1 bids sent/);
  await page.locator('[data-hpd-smoke="fc-agent-offer"]', { hasText: "Which bids did I lose this month?" }).click();
  await page.waitForFunction(() => /Answer 6\./.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(asked[5].question, "Which bids did I lose this month?");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 🔍 Search everything: a job card note.
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("find the job where the tenant said the dog bites");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /🔍 Found/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  const found = await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  assert.match(found, /ER06362 .*the job card's notes: "Tenant said the dog bites, call first\."/);
  assert.equal(asked.length, 6, "search runs on the phone, no AI call");
  assert.deepEqual(errors, []);
  console.log(`PASS smart ask: 3-month bars and "ask next" buttons; search found the dog note on ER06362; a real question near a known phrase went to the AI with bids sent (${f1.bidsSent.last7Days} this week), the week's numbers and all jobs by stage; a named job in full (${named[0].address}); app questions carry the newest ${asked[3].facts.appChanges.length} changes; notes, 3-month trends and emails go along`);
} finally {
  await browser.close();
}
