// Bid made on the iPhone shows on the computer: the computer has an older copy of ER-style bid (sent at
// $1,180), the status server has the iPhone's newer revision ($1,987, revised once). The computer must
// show the iPhone's version, including when the server is busy at first. Nothing real is contacted.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const real = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const nyDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const due = nyDay(new Date(Date.now() + 3 * 86400000));
  const bid = { ...real.bids[0], omo: "ER77777", bidDue: due, bidDueTime: "10:00 AM" };
  const base = { omo: "ER77777", address: bid.address, borough: bid.borough, bidDue: due, bidDueTime: "10:00 AM", faxTo: "2128638655@humblefax.com" };
  const older = { ...base, price: 1180, sentPrice: 1180, status: "sent", sentAt: "2026-10-12T22:47:39.343Z", savedAt: "2026-10-12T22:47:00.000Z", attempts: 1, updatedAt: "2026-10-12T22:47:39.500Z" };
  const newer = { ...base, price: 1987, sentPrice: 1987, status: "sent", sentAt: "2026-10-13T00:51:57.111Z", savedAt: "2026-10-13T00:51:39.415Z", attempts: 2, updatedAt: "2026-10-13T00:51:57.272Z", revisions: [{ price: 1180, sentAt: older.sentAt }] };

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let calls = 0;
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "GET" && /\/overrides/.test(r.request().url()) && ++calls === 1) return r.fulfill({ status: 503, body: "busy" });
    return r.fulfill({ json: { ok: true, overrides: { "BID-ER77777": newer }, accepted: [] } });
  });
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...real, bids: [bid, ...real.bids.slice(1)] } }));
  const faxChecks = [];
  await context.route(/\/api\/drive\/fax-status/, (r) => { faxChecks.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { status: "confirmed", subject: "Successful transmission", at: "2026-10-13T00:56:00Z" } }); });
  await context.addInitScript((rec) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-bid-records-v1", JSON.stringify({ ER77777: rec })); sessionStorage.setItem("seeded", "1"); } }, older);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  const row = page.locator('[data-hpd-smoke="fc-bids-list"] ol > li').filter({ hasText: "ER77777" });
  await page.waitForFunction(() => /\$1,987/.test(document.querySelector('[data-hpd-smoke="fc-bids-list"]')?.textContent || ""), null, { timeout: 20000 });
  assert.match(await row.innerText(), /\$1,987/, "the computer shows the iPhone's revised price");
  assert.ok(!/\$1,180/.test(await row.innerText()));
  // HumbleFax's email is found in the background: the list says confirmed and the pin is green, without
  // opening the job.
  await page.waitForFunction(() => /\$1,987 · confirmed/.test(document.querySelector('[data-hpd-smoke="fc-bids-list"]')?.textContent || ""), null, { timeout: 20000 });
  assert.equal(faxChecks[0].omo, "ER77777");
  assert.equal(faxChecks[0].sentAt, "2026-10-13T00:51:57.111Z", "checked from the time of the revised fax");
  await row.locator("button").click();
  const status = page.locator('[data-hpd-smoke="fc-bid-status"]');
  await status.waitFor({ timeout: 10000 });
  assert.match(await status.innerText(), /Fax confirmed by HumbleFax[\s\S]*at \$1,987\.00 to HPD fax[\s\S]*2 sends[\s\S]*Successful transmission/);
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("hpd-bid-records-v1"))).ER77777.price, 1987, "kept on the computer too");
  await page.locator('[data-hpd-smoke="fc-bid-sheet"] header button').click();
  await page.locator('[data-hpd-smoke="fc-bids-mine"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-my-bids"]').innerText(), /ER77777[\s\S]*\$1,987[\s\S]*revised 1x/);
  assert.ok(calls >= 2, "tried the server again after it was busy");
  assert.deepEqual(errors, []);
  console.log("PASS bid sync: the computer had $1,180, the iPhone revised to $1,987; the computer shows $1,987, 2 sends, revised 1x (server busy at first); HumbleFax confirmation found in the background without opening the job");
} finally {
  await browser.close();
}
