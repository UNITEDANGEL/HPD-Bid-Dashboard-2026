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
  const SECURE = "REPAIR BUILDING ENTRANCE DOOR SECURE-TECH LOCK AND BUZZER SYSTEM. ***DO NOT CHANGE KEY LOCK CYLINDER***. MAKE ANY NEEDED ADJUSTMENTS TO ALLOW DOOR TO SELF CLOSE AND LATCH. TOTAL DOORS= (1) REMOVE ALL WORK-RELATED DEBRIS.";
  const bid = { ...real.bids[0], omo: "ER77777", bidDue: due, bidDueTime: "10:00 AM", description: SECURE, notes: "NOTE – CONTRACTOR MUST CONTACT HPD WITH START DATE. TENANT CONTACT : JANE TEST (917) 000-0000. IF THE LANDLORD REFUSES ACCESS, AN AFFIDAVIT COPY MUST BE FAXED TO OUR SITE OFFICE @ 212 863 6008." };
  // A new invitation for the same kind of work: it should start from your price.
  const today = nyDay(new Date());
  const nyHM = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(Date.now() + 60 * 60000)).split(":").map(Number);
  const soonTime = nyHM[0] < 1 ? "11:59 PM" : `${((nyHM[0] + 11) % 12) + 1}:${String(nyHM[1]).padStart(2, "0")} ${nyHM[0] >= 12 ? "PM" : "AM"}`;
  const pendingBid = { ...real.bids[0], omo: "ER77779", bidDue: today, bidDueTime: "11:59 PM", address: "3 PENDING ST" };
  const unsentBid = { ...real.bids[0], omo: "ER77780", bidDue: today, bidDueTime: soonTime, address: "4 NOT SENT ST" };
  const pendingRec = { omo: "ER77779", address: "3 PENDING ST", bidDue: today, bidDueTime: "11:59 PM", price: 500, sentPrice: 500, status: "sent", sentAt: new Date(Date.now() - 3 * 60000).toISOString(), savedAt: new Date(Date.now() - 5 * 60000).toISOString(), attempts: 1, updatedAt: new Date(Date.now() - 3 * 60000).toISOString(), faxTo: "2128638655@humblefax.com" };
  const twin = { ...real.bids[0], omo: "ER77778", bidDue: due, bidDueTime: "11:00 AM", address: "2 TWIN ST", description: SECURE.replace("REPAIR BUILDING ENTRANCE DOOR", "AT BUILDING ENTRANCE DOOR: REPAIR") };
  const base = { omo: "ER77777", address: bid.address, borough: bid.borough, bidDue: due, bidDueTime: "10:00 AM", faxTo: "2128638655@humblefax.com" };
  const older = { ...base, price: 1180, sentPrice: 1180, status: "sent", sentAt: "2026-10-12T22:47:39.343Z", savedAt: "2026-10-12T22:47:00.000Z", attempts: 1, updatedAt: "2026-10-12T22:47:39.500Z" };
  const newer = { ...base, price: 1987, sentPrice: 1987, status: "sent", sentAt: "2026-10-13T00:51:57.111Z", savedAt: "2026-10-13T00:51:39.415Z", attempts: 2, updatedAt: "2026-10-13T00:51:57.272Z", revisions: [{ price: 1180, sentAt: older.sentAt }], reason: "Secure-Tech lock costs ~$2,000" };

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let calls = 0;
  const posted = {};
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "GET" && /\/overrides/.test(r.request().url()) && ++calls === 1) return r.fulfill({ status: 503, body: "busy" });
    if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData() || "{}"); posted[b.key] = b.patch; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: { "BID-ER77777": newer, "BID-ER77779": pendingRec }, accepted: [] } });
  });
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...real, bids: [bid, twin, pendingBid, unsentBid, ...real.bids.slice(1).filter((b) => b.bidDue !== today)] } }));
  const faxChecks = [];
  await context.route(/\/api\/drive\/fax-status/, (r) => { faxChecks.push(JSON.parse(r.request().postData() || "{}")); const body = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: body.omo === "ER77779" ? { status: "waiting" } : { status: "confirmed", subject: "Successful transmission", at: "2026-10-13T00:56:00Z" } }); });
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

  // A fax still going through: blue hourglass on the list and the map. A bid due within the hour that
  // isn't sent: red pulsing pin.
  await page.waitForFunction(() => /⏳ Fax going through · \$500/.test(document.querySelector('[data-hpd-smoke="fc-bids-list"]')?.textContent || ""), null, { timeout: 15000 });
  if (Number.isFinite(pendingBid.lat)) assert.equal(await page.locator('.fc-bid-pin.is-pending[title^="ER77779 "]').count(), 1, "blue pin while the fax goes through");
  if (Number.isFinite(unsentBid.lat)) await page.waitForFunction(() => document.querySelectorAll('.fc-bid-pin.is-alert[title^="ER77780 "]').length === 1, null, { timeout: 10000 });

  // Start bidding: counter of today's bids and an alert for the one not sent.
  const start = page.locator('[data-hpd-smoke="fc-session-start"]');
  assert.match(await start.innerText(), /Start bidding · 2 due today · 1 not sent/);
  await start.click();
  const sessionBox = page.locator('[data-hpd-smoke="fc-session"]');
  await sessionBox.waitFor({ timeout: 5000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-session-count"]').innerText(), /1 of 2 due today sent · 0 confirmed · 1 going through/);
  assert.match(await page.locator('[data-hpd-smoke="fc-session-alerts"]').innerText(), /ER77780\s*due \d{1,2}:\d{2} [AP]M · (\d+ min|\d+h \d+m) left · not priced yet/);
  await page.waitForFunction(() => true);
  assert.equal(posted["BIDDING-SESSION"]?.active, true, "the session reaches the status server (the fax checker follows it)");
  assert.equal(posted["BIDDING-SESSION"]?.day, today);

  // Hide the list to see the map, and bring it back.
  await page.locator('[data-hpd-smoke="fc-bids-collapse"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-list"] ol').isVisible(), false, "list hidden");
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-collapse"]').innerText(), /Show the list · 1 of 2 due today sent/);
  await page.locator('[data-hpd-smoke="fc-bids-collapse"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-list"] ol').first().isVisible(), true);
  // HumbleFax's email is found in the background: the list says confirmed and the pin is green, without
  // opening the job.
  await page.waitForFunction(() => /Fax confirmed · \$1,987/.test(document.querySelector('[data-hpd-smoke="fc-bids-list"]')?.textContent || ""), null, { timeout: 20000 });
  assert.equal(faxChecks[0].omo, "ER77777");
  assert.equal(faxChecks[0].sentAt, "2026-10-13T00:51:57.111Z", "checked from the time of the revised fax");
  await row.locator("button").click();
  const status = page.locator('[data-hpd-smoke="fc-bid-status"]');
  await status.waitFor({ timeout: 10000 });
  assert.match(await status.innerText(), /Fax confirmed by HumbleFax[\s\S]*at \$1,987\.00 to HPD fax[\s\S]*2 sends[\s\S]*Successful transmission/);
  // The job card: HPD notes word for word, step 3 marked confirmed, and the bid history.
  assert.match(await page.locator('[data-hpd-smoke="fc-bid-notes"]').innerText(), /TENANT CONTACT : JANE TEST \(917\) 000-0000/);
  assert.match(await page.locator('[data-hpd-smoke="fc-step-3"]').innerText(), /✓ · Send to HPD · fax confirmed \$1,987\.00/i);
  const log = await page.locator('[data-hpd-smoke="fc-bid-log"]').innerText();
  assert.match(log, /HumbleFax: Successful Transmission/, "HumbleFax's answer is logged");
  assert.ok(await page.locator('[data-hpd-smoke="fc-bid-description"]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)) >= 16, "big description text");
  assert.ok(!(await page.locator('[data-hpd-smoke="fc-bid-description"]').getAttribute("class")).includes("is-short"), "the whole description shows");
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("hpd-bid-records-v1"))).ER77777.price, 1987, "kept on the computer too");
  await page.locator('[data-hpd-smoke="fc-bid-sheet"] header button').click();
  await page.locator('[data-hpd-smoke="fc-bids-mine"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-my-bids"]').innerText(), /ER77777[\s\S]*\$1,987[\s\S]*revised 1x/);
  assert.ok(calls >= 2, "tried the server again after it was busy");

  // Learning from you: the same kind of job starts from your $1,987, with your reason.
  await page.getByRole("tab", { name: /^Open/ }).click();
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li').filter({ hasText: "ER77778" }).locator("button").click();
  const mineBox = page.locator('[data-hpd-smoke="fc-bid-mine"]');
  await mineBox.waitFor({ timeout: 10000 });
  assert.match(await mineBox.innerText(), /Your price for this work: \$1,987[\s\S]*ER77777[\s\S]*sent to HPD[\s\S]*Secure-Tech lock costs ~\$2,000/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-price"]').inputValue(), "1987", "started from your price");
  await page.locator('[data-hpd-smoke="fc-bid-price"]').fill("1900");
  await mineBox.getByRole("button", { name: "Use $1,987" }).click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-price"]').inputValue(), "1987");
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-reason"]').evaluate((e) => getComputedStyle(e).fontSize), "13px", "the reason box is normal-size text, not the big price font");
  // Saving with a reason keeps it for next time.
  await page.locator('[data-hpd-smoke="fc-bid-reason"]').fill("Buzzer needs a new transformer");
  await page.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}").ER77778?.reason === "Buzzer needs a new transformer", null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log("PASS bid sync: the computer had $1,180, the iPhone revised to $1,987; the computer shows $1,987, 2 sends, revised 1x (server busy at first); HumbleFax confirmation found in the background without opening the job; the same kind of job starts from your $1,987 with your reason; bidding session, pending / alert pins, notes, history, hide the list");
} finally {
  await browser.close();
}
