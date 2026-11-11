// 🤝 In touch → the route (plan item 26, owner 10 Nov: "I like the in touch button; we need to call these tenants, make
// appointments, put them in the route"): a 72 HR notice we already answered ("we are in touch") with no day yet sits on
// 📤 Sent · waiting; "Put N in-touch jobs with no day on the next day's route" puts it on the next working day's route
// (each stop there says whether the tenant was reached). Nothing is sent.
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
  const L = "Test Tracker <test.tracker@hpd.nyc.gov>";
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-touch-72", subject: `72 HR POOR PERFORMANCE NOTICE- OMO#${JOB}`, omos: [JOB], kind: "past due", people: ["Test Tracker"], count: 2, lastAt: ago(5), waiting: false,
      messages: [
        { at: ago(10), from: L, hpd: true, mine: false, subject: "72", text: `Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#${JOB}.\nTest Tracker test.tracker@hpd.nyc.gov`, files: [] },
        { at: ago(5), from: "us", hpd: false, mine: true, subject: "re", text: `We are in touch with the tenant on OMO# ${JOB} and setting a day.`, files: [] },
      ] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const mails = [];
  await c.route("**/api/drive/hpd-reply", (r) => { mails.push(1); return r.fulfill({ json: { sent: true } }); });
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor({ timeout: 60000 });
  await board.locator('[data-hpd-smoke="fc-board-side-waiting"]').click();
  await board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${JOB}"]`).first().waitFor({ timeout: 20000 });
  const btn = board.locator('[data-hpd-smoke="fc-touch-route"]');
  assert.match(await btn.innerText(), /🗺 Put \d+ in-touch jobs? with no day on the next day's route/);
  await btn.click();
  assert.match(await board.locator('[data-hpd-smoke="fc-overdue-routed"]').innerText(), /in-touch jobs? put on the route for .*call the ones marked 🔴 first/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1") || "null"));
  assert.equal(saved.settings.date, next, "the next working day");
  assert.ok(saved.ids.includes(JOB), `${JOB} is on it`);
  assert.equal(mails.length, 0, "nothing sent");
  assert.deepEqual(errors, []);
  console.log(`PASS in touch → route: ${JOB} (answered, no day yet) went on the route for ${next} from 📤 Sent · waiting; nothing sent`);
} finally {
  await browser.close();
}
