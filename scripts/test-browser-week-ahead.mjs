// 📅 Next 7 days (plan, 19 Nov: "jobs, appointments, bids due and notices for the next 7 days on one screen"), at iPhone
// size: All → Next 7 days shows tomorrow's tenant appointment and the bids due by day; a bid opens Bids on it, the
// appointment opens the job card. Nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const ny = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + offset * 86400000));
const [today, tomorrow, in3] = [ny(0), ny(1), ny(3)];
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const usable = fetched.bids.filter((b) => b.omo && Number.isFinite(b.lat)).slice(0, 2);
assert.equal(usable.length, 2, "two invitations");
const [A, B] = [{ ...usable[0], bidDue: tomorrow, bidDueTime: "10:00 AM" }, { ...usable[1], bidDue: in3, bidDueTime: "2:00 PM" }];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [A, B] } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let sends = 0;
  await context.route(/\/api\/(drive\/fax-bid|email|sms)/, (r) => { sends += 1; return r.fulfill({ json: { ok: true } }); });
  await context.addInitScript(([day]) => {
    try { if (!sessionStorage.getItem("wk")) { sessionStorage.setItem("wk", "1"); localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ EQ15239: { Appointment: { date: day, start: "09:00", end: "11:00", state: "confirmed", contact: "Tenant", phone: "", note: "", reminder: 60 } } })); } } catch { /* private mode */ }
  }, [tomorrow]);
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').waitFor();
  await page.waitForTimeout(2500); // the invitations load after the first paint
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-more-week"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-week-sheet"]');
  await sheet.waitFor({ timeout: 10000 });
  const days = sheet.locator('[data-hpd-smoke="fc-week-day"]');
  assert.equal(await days.count(), 7, "seven days");
  assert.equal(await days.first().getAttribute("data-date"), today);
  assert.match(await days.nth(0).locator("h3").innerText(), /^Today/);
  assert.match(await days.nth(1).locator("h3").innerText(), /^Tomorrow/);
  const tom = days.nth(1);
  const tomItems = (await tom.locator('[data-hpd-smoke="fc-week-item"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  assert.ok(tomItems[0].includes("EQ15239") && /Appointment 9:00 AM–11:00 AM/.test(tomItems[0]), `tomorrow starts with the 9 AM appointment: ${tomItems.join(" | ")}`);
  assert.ok(tomItems.some((t) => t.includes(A.omo) && /Bid due 10:00 AM/.test(t)), `tomorrow has bid ${A.omo}: ${tomItems.join(" | ")}`);
  assert.ok((await days.nth(3).innerText()).includes(B.omo), `bid ${B.omo} on day 3`);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-week-line"]').innerText(), /Next 7 days: .*1 appointment.*2 bids due/);
  // A bid opens Bids on it.
  await tom.locator(`[data-hpd-smoke="fc-week-item"][data-omo="${A.omo}"]`).click();
  await page.locator('[data-hpd-smoke="fc-bid-sheet"] header strong', { hasText: A.omo }).waitFor({ timeout: 30000 });
  assert.equal(await sheet.count(), 0, "the week closes when a bid opens");
  // Back to the week, the appointment opens its job card.
  await page.goto(`${baseUrl}/map/`, { waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-more-week"]').click();
  await sheet.locator('[data-hpd-smoke="fc-week-item"][data-omo="EQ15239"]').click();
  await page.locator("#fc-job-card").waitFor({ timeout: 30000 });
  assert.match(await page.locator("#fc-job-card").innerText(), /EQ15239/);
  assert.equal(sends, 0, "nothing sent");
  assert.deepEqual(errors, []);
  console.log(`PASS next 7 days: 7 days from today; tomorrow: EQ15239 appointment 9 AM, then ${A.omo} bid 10 AM; ${B.omo} on day 3; a bid opens Bids, the appointment opens the job card; nothing sent`);
} finally {
  await browser.close();
}
