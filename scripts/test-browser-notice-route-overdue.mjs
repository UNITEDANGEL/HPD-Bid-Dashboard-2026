// 🗺 Overdue notices onto the next day's route (owner, 9 Nov: "we have these jobs in the route for tomorrow which are in
// the overdue notices ... prioritize the overdues and start working on them ... reply back to Lewis"). On the board:
// "Put N overdue on the next day's route" adds the overdue jobs with no day yet to the next working day's route; each
// notice then says "You go <day>. Tell Lewis", and the day is in the update. Today's route with stops is never replaced.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const JOB = "ER02330";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const next = (() => { const t = new Date(`${today}T12:00:00Z`); do t.setUTCDate(t.getUTCDate() + 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6); return t.toISOString().slice(0, 10); })();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const L = "Joy-Ann Lewis <lewis.test@hpd.nyc.gov>";
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-route-24", subject: `24 HR POOR PERFORMANCE NOTICE- OMO#${JOB}`, omos: [JOB], kind: "past due", people: ["Joy-Ann Lewis"], count: 1, lastAt: ago(100), waiting: true,
      messages: [{ at: ago(100), from: L, hpd: true, mine: false, subject: "x", text: `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${JOB}.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov`, files: [] }] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const mails = [];
  await c.route("**/api/drive/hpd-reply", (r) => { mails.push(1); return r.fulfill({ json: { sent: true } }); });
  await c.route("**/api/drive/hpd-draft", (r) => r.fulfill({ json: { ai: false, reason: "not-set-up" } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor({ timeout: 5000 }).catch(() => {}); if (!(await page.locator('[data-hpd-smoke="fc-board"]').count())) await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click(); // Notices opens the board itself (10 Nov)
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  const row = board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${JOB}"]`);
  await row.waitFor({ timeout: 20000 });
  assert.equal(await row.locator('[data-hpd-smoke="fc-board-do"]').getAttribute("data-action"), "reply", "no day yet");
  const btn = board.locator('[data-hpd-smoke="fc-overdue-route"]');
  assert.match(await btn.innerText(), /🗺 Put \d+ overdue on the next day's route/);
  await btn.click();
  assert.match(await board.locator('[data-hpd-smoke="fc-overdue-routed"]').innerText(), /overdue jobs? put on the route for .*Update all overdue to tell Lewis the day/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null"));
  assert.equal(saved.settings.date, next, "the next working day");
  assert.ok(saved.ids.includes(JOB));
  // The notice now has its day.
  await row.locator('[data-hpd-smoke="fc-board-do"][data-action="visit"]').waitFor({ timeout: 10000 });
  assert.match(await row.locator('[data-hpd-smoke="fc-board-do"]').innerText(), /You go .*Tell Lewis/);
  assert.equal(mails.length, 0, "nothing sent");
  // Today's route with stops is never replaced.
  await page.evaluate((d) => localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: d, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: ["EQ15239"] })), today);
  await page.reload({ waitUntil: "load" });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor({ timeout: 5000 }).catch(() => {}); if (!(await page.locator('[data-hpd-smoke="fc-board"]').count())) await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click(); // Notices opens the board itself (10 Nov)
  await board.locator('[data-hpd-smoke="fc-overdue-route"]').click();
  assert.match(await board.locator('[data-hpd-smoke="fc-overdue-routed"]').innerText(), /Not put on the route: today's route still has stops/);
  assert.deepEqual((await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1")))).ids, ["EQ15239"]);
  assert.deepEqual(errors, []);
  console.log(`PASS overdue → route: the overdue job went on the route for ${next}, its notice says "You go … Tell Lewis"; today's route with stops is left alone; nothing sent`);
} finally {
  await browser.close();
}
