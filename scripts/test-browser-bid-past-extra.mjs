// 🗓 Bids sent on a past day + 📎 pages added to a bid (owner, 10 Nov: "pick from the calendar which bids I sent in the
// past, with the option to revise them"; ER09991: "just add the missing work description"). A bid sent yesterday shows
// under 📅 → "Sent on a past day" with 🔁 Open · revise; a bid with a page kept for it in the private files opens with
// that page attached by itself; Add a page adds a PDF; Remove takes it off. Nothing is faxed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const ny = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const tomorrow = ny(new Date(Date.now() + 86400000));
const yesterday = ny(new Date(Date.now() - 86400000));
const bids = fetched.bids.filter((b) => !b.lead).slice(0, 2).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
assert.ok(bids.length === 2);
const [A, B] = bids;
const yesterdayNoon = new Date(`${yesterday}T16:00:00Z`).toISOString();
const records = { [A.omo]: { omo: A.omo, address: A.address, borough: A.borough, bidDue: tomorrow, bidDueTime: "11:00 AM", price: 1450, sentPrice: 1450, savedAt: yesterdayNoon, sentAt: yesterdayNoon, status: "confirmed", attempts: 1, updatedAt: yesterdayNoon } };
// A one-page PDF standing in for the Work Description Form.
const doc = await PDFDocument.create(); doc.addPage([612, 792]).drawText("WORK DESCRIPTION FORM (test)", { x: 50, y: 700, size: 18 });
const formPdf = Buffer.from(await doc.save());
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  // B has a page kept for it in the private files (like ER09991's form).
  await c.route(/\/api\/private\/extra\//, (r) => (r.request().url().includes(B.omo) ? r.fulfill({ status: 200, contentType: "application/pdf", body: formPdf }) : r.fulfill({ status: 404, body: "" })));
  let faxes = 0;
  await c.route(/\/api\/drive\/fax-bid/, (r) => { faxes += 1; return r.fulfill({ json: { sent: true } }); });
  await c.addInitScript((recs) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-bid-records-v1", JSON.stringify(recs)); sessionStorage.setItem("seeded", "1"); } }, records);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  // 🗓 A past day: the calendar closes by itself and the bids sent that day open.
  if (await page.locator('[data-hpd-smoke="fc-bids-welcome-later"]').count()) await page.locator('[data-hpd-smoke="fc-bids-welcome-later"]').click();
  await page.locator('[data-hpd-smoke="fc-bids-day-pick"]').click();
  await page.locator('[data-hpd-smoke="fc-bids-pastday-input"]').fill(yesterday);
  const past = page.locator('[data-hpd-smoke="fc-bids-past"]');
  await past.waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-days"]').count(), 0, "the calendar closed by itself");
  const row = past.locator(`[data-hpd-smoke="fc-bids-past-row"][data-omo="${A.omo}"]`);
  assert.match(await row.innerText(), /\$1,450\.00/);
  await row.locator('[data-hpd-smoke="fc-bids-past-revise"]').click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor({ timeout: 60000 });
  assert.equal((await sheet.locator("header strong").innerText()).trim(), A.omo);
  // 📎 Add a page (PDF) to A.
  const extra = sheet.locator('[data-hpd-smoke="fc-bid-extra"]');
  await extra.locator('[data-hpd-smoke="fc-bid-extra-file"]').setInputFiles({ name: "Work Description Form.pdf", mimeType: "application/pdf", buffer: formPdf });
  await extra.locator('[data-hpd-smoke="fc-bid-extra-row"]').waitFor();
  assert.match(await extra.locator('[data-hpd-smoke="fc-bid-extra-msg"]').innerText(), /Work Description Form\.pdf added/);
  assert.equal(await page.evaluate((o) => JSON.parse(localStorage.getItem(`hpd-bid-extra-${o}`) || "[]").length, A.omo), 1);
  await extra.locator('[data-hpd-smoke="fc-bid-extra-remove"]').click();
  assert.equal(await extra.locator('[data-hpd-smoke="fc-bid-extra-row"]').count(), 0, "removed");
  // B opens with its kept page attached by itself.
  await page.goto(`${baseUrl}/map/?bids=1&omo=${B.omo}`, { waitUntil: "load", timeout: 180000 });
  await sheet.waitFor({ timeout: 60000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-extra-row"]').waitFor({ timeout: 15000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-extra-row"]').innerText(), new RegExp(`${B.omo} Work Description Form\\.pdf`));
  assert.equal(faxes, 0, "nothing faxed");
  assert.deepEqual(errors, []);
  console.log(`PASS past bids + added pages: 🗓 ${yesterday} listed ${A.omo} ($1,450) → Open · revise opened it; 📎 a PDF added and removed; ${B.omo} opened with its Work Description Form attached by itself; nothing faxed`);
} finally {
  await browser.close();
}
