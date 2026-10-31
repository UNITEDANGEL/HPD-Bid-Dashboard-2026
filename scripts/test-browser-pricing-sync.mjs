// Your rates on the phone and the computer (owner, 31 Oct "do 5"): a rate typed on the iPhone shows on the computer, a
// change on the computer comes back to the phone, and signed out of Google the app says they stay on that device.
// Your Google Drive is faked here (one shared private file), nothing real is changed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const JOB = "AT APT 5D 5TH FLOOR KITCHEN AND BATHROOM: REMOVE AND REPLACE DEFECTIVE CERAMIC FLOOR TILES APPROX 40 SQ FT. TRACE AND REPAIR LEAK.";
const bids = fetched.bids.slice(0, 3).map((b, i) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM", ...(i === 0 ? { omo: "ER90003", description: JOB, borough: "BK" } : {}) }));
let driveFile = { rates: {}, floors: {}, costs: {} };
let saves = 0;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function device(options, signedIn = true) {
  const context = await browser.newContext({ serviceWorkers: "block", ...options });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  await context.route(/\/api\/drive\/pricing/, (r) => {
    if (!signedIn) return r.fulfill({ status: 401, json: { error: "Connect Google first." } });
    const body = r.request().postDataJSON();
    if (body.op === "save") { saves++; driveFile = { rates: body.rates, floors: body.floors, costs: body.costs }; return r.fulfill({ json: { saved: true } }); }
    return r.fulfill({ json: driveFile });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
async function openJob(page) {
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li', { hasText: "ER90003" }).first().locator("button").first().click();
  const calc = page.locator('[data-hpd-smoke="fc-bid-sheet"] [data-hpd-smoke="fc-my-price"]');
  await calc.waitFor({ timeout: 15000 });
  return (k) => calc.locator(`[data-hpd-smoke="fc-my-row"][data-key="${k}"]`);
}
async function setRate(row, k, v) {
  await row(k).locator('[data-hpd-smoke="fc-rate-edit"]').click();
  await row(k).locator('[data-hpd-smoke="fc-rate-input"]').fill(v);
  await row(k).locator('[data-hpd-smoke="fc-rate-save"]').click();
}
try {
  // 1. iPhone: floor tile $15 per sq ft and leak $450.
  const phone = await device({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  let row = await openJob(phone.page);
  await setRate(row, "floor", "15");
  await setRate(row, "leak", "450");
  for (let i = 0; i < 40 && !(driveFile.rates.floor && driveFile.rates.leak); i++) await phone.page.waitForTimeout(250);
  assert.equal(driveFile.rates.floor?.v, 15, "the phone's rate went to Drive");
  assert.equal(driveFile.rates.leak?.v, 450);
  assert.ok(saves <= 2, `a few quick edits = few saves (${saves})`);

  // 2. The computer (a separate browser, nothing on it): the same rates show.
  const computer = await device({ viewport: { width: 1280, height: 800 } });
  row = await openJob(computer.page);
  await computer.page.waitForFunction(() => /\$15 per sq ft = \$600/.test(document.querySelector('[data-hpd-smoke="fc-my-row"][data-key="floor"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await row("leak").innerText(), /\$450/);
  // The computer changes the leak to $500.
  await setRate(row, "leak", "500");
  for (let i = 0; i < 40 && driveFile.rates.leak?.v !== 500; i++) await computer.page.waitForTimeout(250);
  assert.equal(driveFile.rates.leak.v, 500);
  // Stats -> Costs says where they're kept.
  await computer.page.locator('[data-hpd-smoke="fc-bid-sheet"] header button').first().click();

  // 3. Back on the phone (opened again): the computer's $500 is there, the floor rate still $15.
  row = await openJob(phone.page);
  await phone.page.waitForFunction(() => /\$500/.test(document.querySelector('[data-hpd-smoke="fc-my-row"][data-key="leak"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await row("floor").innerText(), /\$15 per sq ft/);

  // 4. Signed out of Google on another phone: its own rates stay, and the Costs page says so.
  const other = await device({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, false);
  await other.page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(other.page);
  await other.page.locator('[data-hpd-smoke="fc-bids-stats"]').click();
  await other.page.locator('[data-hpd-smoke="fc-stats-sub-costs"]').first().click();
  const note = other.page.locator('[data-hpd-smoke="fc-pricing-sync"]');
  await note.waitFor({ timeout: 15000 });
  await other.page.waitForFunction(() => /this device only/.test(document.querySelector('[data-hpd-smoke="fc-pricing-sync"]')?.textContent || ""), null, { timeout: 15000 });
  assert.deepEqual([...phone.errors, ...computer.errors, ...other.errors], []);
  console.log(`PASS rates on every device: set on the iPhone -> shown on the computer; changed on the computer -> back on the phone; signed out -> "kept on this device only" (${saves} Drive saves)`);
} finally {
  await browser.close();
}
