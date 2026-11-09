// 🧪 Lead abatement bids (owner, 8 Nov: "ER09991 is a lead abatement bid, it came in the email on Nov 6, can we learn
// to fill this"): an invitation HPD procurement emailed (not OMOBid@) is in the bids with who sent it; the bid screen
// asks for your rate per kind of work for HPD's scope sheet (its Rate / Cost boxes are blank), works out the lines, the
// rooms and the apartment total, and "Use $X as your bid" fills the price. Nothing is faxed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const lead = {
  omo: "ER09991", address: "306 EAST 116 STREET APT. 2A", borough: "MN", bidDue: tomorrow, bidDueTime: "11:00 AM", workStart: tomorrow, workCompletion: tomorrow,
  itbFile: "ER09991 Invitation To Bid.pdf", description: "AS PER HPD'S LEAD ABATEMENT REQUIREMENT CONTRACTS AND ATTACHED SCOPE OF WORK THOROUGHLY REMOVE ALL LEAD VIOLATIONS", pages: 3, fields: {},
  lat: 40.7966, lng: -73.9393, receivedAt: Date.now() - 86400000, kind: "lead", emailedBy: "Carvajal Dimas, Juan (HPD)", certs: "Mold and Lead", scopeFile: "ER09991.pdf",
  lead: { mold: "Mold abatement from west wall prior to enclosure.", apartment: { page: 0, x: 507, y: 79 }, rooms: [
    { room: "BATHROOM", total: { page: 0, x: 525, y: 468 }, items: [
      { component: "SOUTH WALL", method: "Enclosure", qty: 50, um: "SQFT", page: 0, y: 541, rateRight: 459.7, costRight: 505.4 },
      { component: "BASEBOARD AT SOUTH WALL", method: "Replacement", qty: 5, um: "FT", page: 0, y: 507, rateRight: 459.7, costRight: 505.4 }] },
    { room: "3rd ROOM FROM NORTH", total: { page: 0, x: 525, y: 114 }, items: [
      { component: "WEST WALL", method: "Enclosure", qty: 82, um: "SQFT", page: 0, y: 359, rateRight: 459.7, costRight: 505.4 }] },
  ] },
};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [lead, ...fetched.bids.filter((b) => b.omo !== "ER09991").slice(0, 3)] } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let faxes = 0;
  await c.route(/\/api\/drive\/fax-bid/, (r) => { faxes++; return r.fulfill({ json: { sent: true } }); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1&omo=ER09991`, { waitUntil: "load", timeout: 180000 });
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor({ timeout: 60000 });
  assert.equal((await sheet.locator("header strong").innerText()).trim(), "ER09991");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-emailed"]').innerText(), /Emailed by Carvajal Dimas, Juan \(HPD\) · lead abatement/);
  const box = sheet.locator('[data-hpd-smoke="fc-bid-lead"]');
  await box.waitFor();
  assert.match(await box.innerText(), /🧪 Lead abatement · 2 papers go to HPD/);
  // Owner, 9 Nov: "one is a list of prices they request, the other is the same as the jobs we bid".
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-paper-itb"]').innerText(), /① The invitation to bid \(3 pages\)[\s\S]*Same as every bid/);
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-paper-scope"]').innerText(), /② HPD's price list \(scope sheet\)[\s\S]*rate on every line/);
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-lead-wait"]').innerText(), /once every rate is in, so both papers go together/);
  // A price saved before the rates: the package waits for the price list.
  const price = sheet.locator('[data-hpd-smoke="fc-bid-price"]');
  await price.fill("2000");
  // A high price asks for a second tap to save.
  const save = async () => { const b = sheet.locator('[data-hpd-smoke="fc-bid-save"]'); await b.click(); await page.waitForTimeout(300); if (await b.isEnabled()) await b.click(); };
  await save();
  const reviewBtn = sheet.locator('[data-hpd-smoke="fc-bid-review"]');
  await reviewBtn.waitFor({ timeout: 5000 });
  assert.ok(await reviewBtn.isDisabled(), "no package with only the invitation");
  assert.match(await reviewBtn.innerText(), /Put every rate on HPD's price list first \(2 to go\)/);
  assert.equal(await box.locator('[data-hpd-smoke="fc-bid-lead-use"]').count(), 0, "no total until every rate is in");
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-lead-total"]').innerText(), /2 rates to go/);
  const rates = box.locator('[data-hpd-smoke="fc-bid-lead-rate"]');
  assert.equal(await rates.count(), 2);
  assert.match(await box.innerText(), /Enclosure · 132 sq ft \(2 lines\)/);
  await box.locator('[data-key="Enclosure|SQFT"]').fill("18");
  await box.locator('[data-key="Replacement|FT"]').fill("40");
  await page.waitForFunction(() => /Apartment total: \$2,576\.00/.test(document.querySelector('[data-hpd-smoke="fc-bid-lead-total"]')?.textContent || ""), null, { timeout: 5000 });
  const t = await box.innerText();
  assert.match(t, /BATHROOM: \$1,100\.00/);
  assert.match(t, /3rd ROOM FROM NORTH: \$1,476\.00/);
  assert.match(t, /Mold abatement from west wall prior to enclosure\./);
  assert.match(t, /HPD asks for valid Mold and Lead certifications\./);
  assert.equal(await box.locator('[data-hpd-smoke="fc-bid-cert-warn"]').count(), 0, "no papers saved: no warning");
  assert.match(t, /Both papers go in one bid package: the invitation, then the filled price list/);
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-paper-scope"]').innerText(), /^✓ HPD's price list/);
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-lead-mismatch"]').innerText(), /\$2,000\.00 is not the price list total \$2,576\.00/);
  assert.match(await box.locator('[data-hpd-smoke="fc-bid-lead-scope"]').getAttribute("href"), /\/api\/private\/itb\/ER09991\.pdf$/);
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-lead-rates-ER09991")), JSON.stringify({ "Enclosure|SQFT": 18, "Replacement|FT": 40 }), "rates kept on the phone");
  await box.locator('[data-hpd-smoke="fc-bid-lead-use"]').click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-bid-price"]')?.value?.replace(/[^0-9.]/g, "").replace(/\.0+$/, "") === "2576", null, { timeout: 5000 });
  await save();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-bid-paper-itb"]')?.classList.contains("is-done"), null, { timeout: 5000 });
  assert.equal(await box.locator('[data-hpd-smoke="fc-bid-lead-mismatch"]').count(), 0, "prices match now");
  assert.ok(await reviewBtn.isEnabled(), "both papers ready: the package can be filled");
  assert.match(await reviewBtn.innerText(), /Fill the package at \$2,576\.00/);
  assert.equal(faxes, 0, "nothing faxed");
  await box.screenshot({ path: `${process.env.TEMP || "/tmp"}/lead-box.png` });
  assert.deepEqual(errors, []);
  console.log("PASS lead bid: 2 papers (the invitation and HPD's price list), the package waits for every rate, a price that is not the list total is flagged; emailed invitation with who sent it; rates per kind of work price HPD's scope sheet (lines, rooms, apartment $2,576), kept on the phone; Use fills the bid price; nothing faxed");
} finally {
  await browser.close();
}
