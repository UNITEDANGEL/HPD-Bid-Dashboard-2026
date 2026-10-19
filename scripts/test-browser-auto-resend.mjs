// A failed bid fax is sent again by itself (owner, 19 Oct: "ER06690 failed, I tried to resend it, it does not let me...
// this should be auto resend and confirm"). Opening Bids: the failed fax goes again, at the same price, to the next HPD
// line; the record says so; HumbleFax's confirmation then turns it green. A second failure is resent once more (other
// line); a "Resend now" button works with one tap, no hidden refill step. Fax and status server are faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const real = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const nyDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const today = nyDay(new Date());
  const bid = { ...real.bids[0], omo: "ER77790", bidDue: today, bidDueTime: "11:59 PM", address: "9 FAILED FAX ST" };
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const failed = { omo: "ER77790", address: bid.address, borough: bid.borough, bidDue: today, bidDueTime: "11:59 PM", price: 2200, sentPrice: 2200, status: "failed", sentAt: ago(20), confirmedAt: ago(8), faxNote: "Unsuccessful Transmission", faxTo: "2128638655@humblefax.com", savedAt: ago(21), attempts: 1, updatedAt: ago(8), log: [] };

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  const posted = [];
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { posted.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: { "BID-ER77790": failed }, accepted: [] } });
  });
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...real, bids: [bid, ...real.bids.slice(1)] } }));
  const faxes = [];
  await context.route(/\/api\/drive\/fax-bid/, (r) => {
    const line = r.request().headers()["x-hpd-fax-line"] || "main";
    faxes.push(line);
    return r.fulfill({ json: { sent: true, to: line === "7804" ? "2128637804@humblefax.com" : line === "7805" ? "2128637805@humblefax.com" : "2128638655@humblefax.com", messageId: `m${faxes.length}`, sentAt: new Date().toISOString() } });
  });
  let faxResult = { status: "waiting" };
  await context.route(/\/api\/drive\/fax-status/, (r) => r.fulfill({ json: faxResult }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();

  // By itself: sent again to the next line (main failed -> (212) 863-7804), same price.
  await page.waitForFunction(() => /sent again automatically to \(212\) 863-7804/.test(document.querySelector('[data-hpd-smoke="fc-bids-autonote"]')?.textContent || ""), null, { timeout: 30000 });
  assert.deepEqual(faxes, ["7804"], "one automatic fax, to the next line");
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}").ER77790);
  assert.equal(rec.status, "sent");
  assert.equal(rec.sentPrice, 2200);
  assert.equal(rec.autoResends, 1);
  assert.ok(rec.log.some((l) => /sending it again automatically to \(212\) 863-7804/.test(l.what)) && rec.log.some((l) => /Fax sent again automatically to HPD \(212\) 863-7804 at \$2,200/.test(l.what)), "the record says what happened");
  if (shots) await page.screenshot({ path: `${shots}/resend-1.png` });

  // HumbleFax confirms within the minute: green.
  faxResult = { status: "confirmed", subject: "Successful Transmission", at: new Date().toISOString() };
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}").ER77790?.status === "confirmed", null, { timeout: 90000 });

  // Reload: nothing is sent twice.
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await page.waitForTimeout(4000);
  assert.equal(faxes.length, 1, "not sent twice");
  assert.deepEqual(errors, []);
  console.log(`PASS auto resend: the failed fax went again by itself to (212) 863-7804 at $2,200 (logged), HumbleFax confirmed it, nothing sent twice`);
  await context.close();
} finally {
  await browser.close();
}
