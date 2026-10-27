// No bid at iPhone size: open an invitation, tap 🚫 No bid, pick "Too far" -> the bid says No bid: Too far,
// the list row and the map pin show it, the checklist has one fewer to bid; the status server gets
// NOBID-<OMO> (other phones see it). Undo brings it back. Then (owner, 20 Oct: "fill no bid and send") another one:
// the NO BID form is made right away and faxed to HPD with two taps (faked here), HumbleFax confirms it.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

// Today's real list can be short: copies with made-up numbers fill it up to n.
const padBids = (list, n) => Array.from({ length: Math.max(n, list.length) }, (_, i) => (i < list.length ? list[i] : { ...list[i % list.length], omo: `ER99${String(900 + i)}` }));
const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = padBids(fetched.bids, 5).slice(0, 5).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const posted = {};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, async (r) => {
    if (r.request().method() === "POST" && /\/override$/.test(r.request().url())) { const b = r.request().postDataJSON(); posted[b.key] = b.patch; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  const faxes = [];
  await context.route(/\/api\/drive\/fax-bid/, (r) => {
    faxes.push({ subject: decodeURIComponent(r.request().headers()["x-hpd-subject"] || ""), line: r.request().headers()["x-hpd-fax-line"] || "", body: r.request().postData() || "" });
    return r.fulfill({ json: { sent: true, to: "2128638655@humblefax.com", messageId: `m${faxes.length}`, sentAt: new Date().toISOString() } });
  });
  await context.route(/\/api\/drive\/fax-status/, (r) => r.fulfill({ json: { status: "confirmed", subject: "Successful Transmission", at: new Date().toISOString() } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  const omo = bids[0].omo;
  const row = list.locator("ol > li", { hasText: omo }).first();
  await row.waitFor({ timeout: 30000 });
  const before = (await page.locator('[data-hpd-smoke="fc-checklist-toggle"] b').innerText()).trim();
  assert.match(before, /0 of 5 sent/);
  await row.locator("button").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.locator('[data-hpd-smoke="fc-nobid"]').click();
  await sheet.locator('[data-hpd-smoke="fc-nobid-reason"]', { hasText: "Too far" }).click();
  await sheet.locator('[data-hpd-smoke="fc-nobid-set"]').waitFor({ timeout: 5000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-nobid-set"]').innerText(), /No bid: Too far/);
  assert.equal(posted[`NOBID-${omo}`]?.reason, "Too far", "reaches the status server");
  assert.equal(posted[`BID-${omo}`], undefined, "no bid record (no fax) was made");
  await sheet.locator("header button").first().click();
  await openBidList(page);
  assert.match(await row.innerText(), /🚫 No bid/);
  assert.match(await page.locator('[data-hpd-smoke="fc-checklist-toggle"] b').innerText(), /0 of 4 sent/, "one fewer to bid");
  if (Number.isFinite(bids[0].lat)) assert.equal(await page.locator(`.fc-bid-pin.is-nobid[title^="${omo} "]`).count(), 1, "grey pin");
  // Kept after reload; Undo brings it back.
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load" });
  await openBidList(page);
  await row.waitFor();
  assert.match(await row.innerText(), /🚫 No bid/);
  await row.locator("button").first().click();
  await sheet.locator('[data-hpd-smoke="fc-nobid-undo"]').click();
  await sheet.locator('[data-hpd-smoke="fc-nobid"]').waitFor({ timeout: 5000 });
  assert.equal(posted[`NOBID-${omo}`]?.undone, true);
  await sheet.locator("header button").first().click();
  await openBidList(page);
  assert.match(await page.locator('[data-hpd-smoke="fc-checklist-toggle"] b').innerText(), /0 of 5 sent/, "back on the checklist");
  // No bid -> NO BID form -> fax (two taps) -> confirmed.
  const bid2 = bids.find((b) => b.itbFile && b.omo !== omo);
  if (bid2) {
    const omo2 = bid2.omo;
    await list.locator("ol > li", { hasText: omo2 }).first().locator("button").first().click();
    await sheet.locator('[data-hpd-smoke="fc-nobid"]').click();
    await sheet.locator('[data-hpd-smoke="fc-nobid-reason"]', { hasText: "Too busy that day" }).click();
    await sheet.locator('[data-hpd-smoke="fc-nobid-form"]').waitFor({ timeout: 30000 });
    const faxBtn = sheet.locator('[data-hpd-smoke="fc-nobid-fax"]');
    await faxBtn.scrollIntoViewIfNeeded();
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/nobid-1-ready.png` });
    await faxBtn.click();
    assert.equal(faxes.length, 0, "first tap only arms");
    assert.match(await faxBtn.innerText(), /Tap again: fax NO BID to \(212\) 863-8655/);
    await faxBtn.click();
    await sheet.locator('[data-hpd-smoke="fc-nobid-fax-status"]', { hasText: /confirmed by HumbleFax/ }).waitFor({ timeout: 90000 });
    assert.equal(faxes.length, 1);
    const fx = faxes[0];
    assert.equal(fx.subject, `NO BID - OMO ${omo2} - ${bid2.address} - United Angel Construction Corp.`);
    assert.equal(fx.line, "main");
    // The cover text is the first base64 part of the email.
    const cover = Buffer.from(((/Content-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\s]+?)\r?\n--/.exec(fx.body) || [])[1] || "").replace(/\s+/g, ""), "base64").toString("utf8");
    assert.match(cover, new RegExp(`^NO BID for OMO ${omo2}`));
    assert.match(cover, /will not be bidding on this job/);
    assert.match(fx.body, new RegExp(`${omo2}_NO_BID_`));
    assert.ok(!cover.includes("Too busy"), "the reason stays private");
    assert.equal(posted[`NOBID-${omo2}`]?.faxStatus, "confirmed", "other phones see it was faxed and confirmed");
    assert.equal(await sheet.locator('[data-hpd-smoke="fc-nobid-undo"]').count(), 0, "no undo after it went to HPD");
    if (process.env.SHOTS) {
      await sheet.locator('[data-hpd-smoke="fc-nobid-set"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${process.env.SHOTS}/nobid-2-sent.png` });
      const b64 = (/filename="[^"]*NO_BID[^"]*"[\s\S]*?(?:\r?\n){2}([A-Za-z0-9+/=\s]+)/.exec(fx.body) || [])[1];
      if (b64) (await import("node:fs")).writeFileSync(`${process.env.SHOTS}/nobid.pdf`, Buffer.from(b64.replace(/\s+/g, ""), "base64"));
    }
  }
  assert.deepEqual(errors, []);
  console.log(`PASS no bid: ${omo} marked No bid (Too far): row chip, grey pin, checklist 5 -> 4 to bid, NOBID-${omo} on the status server, no fax record; kept after reload; Undo puts it back; ${bid2 ? `${bid2.omo}: NO BID form made, faxed with two taps (subject NO BID, reason not sent), HumbleFax confirmed` : 'no invitation PDF to fax'}`);
  await context.close();
} finally {
  await browser.close();
}
