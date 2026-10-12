// Browser test of Invitations to bid at iPhone size, the full flow: the envelope flips the map to the
// open bids (past ones hidden), a bid opens with its due date, description and invitation; save a
// price, fill and review the package (checked inside the PDF), send it by fax (HumbleFax, Gmail and the
// status server are all faked here: nothing is sent), see "Fax confirmed", the green pin and the
// "Sent" badge; a failed fax offers Resend; My bids lists them. Needs the app running.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const saved = {};
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, async (r) => {
    if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData() || "{}"); saved[b.key] = b.patch; }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  // Only bids that can still be sent show: two already-past ones are slipped into the real list.
  const real = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const nyDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const today = nyDay(new Date()), yesterday = nyDay(new Date(Date.now() - 86400000));
  const past = [{ ...real.bids[0], omo: "PAST01", bidDue: yesterday, bidDueTime: "11:00 AM" }, { ...real.bids[0], omo: "PAST02", bidDue: today, bidDueTime: "12:01 AM" }];
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...real, bids: [...past, ...real.bids] } }));
  // Fax: the request is checked and answered here; status is "confirmed" for the first bid, "failed" for the second.
  const faxes = [];
  let failOmo = "";
  await context.route(/\/api\/drive\/fax-bid/, (r) => {
    faxes.push({ subject: decodeURIComponent(r.request().headers()["x-hpd-subject"] || ""), body: r.request().postData() || "" });
    return r.fulfill({ json: { sent: true, to: "2128638655@humblefax.com", messageId: `m${faxes.length}`, sentAt: new Date().toISOString() } });
  });
  await context.route(/\/api\/drive\/fax-status/, (r) => {
    const { omo } = JSON.parse(r.request().postData() || "{}");
    return r.fulfill({ json: omo === failOmo ? { status: "failed", subject: "Fax failed: busy", at: new Date().toISOString() } : { status: "confirmed", subject: "Your fax was sent successfully", at: new Date().toISOString() } });
  });
  await context.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { localStorage.removeItem("hpd-bid-records-v1"); sessionStorage.setItem("seeded", "1"); } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });

  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const minutes = (t) => { const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]) : 1440; };
  const open = real.bids.filter((b) => b.bidDue > today || (b.bidDue === today && minutes(b.bidDueTime) > clock[0] * 60 + clock[1]));
  assert.ok(open.length >= 2, "at least two open bids to test with");

  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  await list.locator("li").first().waitFor({ timeout: 20000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-banner"]').innerText(), new RegExp(`${open.length} open to bid · due today or later`));
  assert.equal(await list.locator("ol > li").count(), open.length);
  assert.ok(!/PAST01|PAST02/.test(await list.innerText()), "past bids are not shown");
  assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector(".leaflet-marker-pane")).visibility === "hidden"), "job pins hidden");

  // 1. Save a price.
  await list.locator("ol > li button").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor();
  const omo = (await sheet.locator("header strong").innerText()).trim();
  const bid = open.find((b) => b.omo === omo);
  assert.equal((await sheet.locator('[data-hpd-smoke="fc-bid-description"]').innerText()).trim(), bid.description);
  assert.equal((await page.request.get(baseUrl + await sheet.locator('[data-hpd-smoke="fc-bid-view"]').getAttribute("href"))).status(), 200);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-review"]').count(), 0, "review comes after saving a price");
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("1250");
  await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-saved"]').innerText(), /Price saved: \$1,250\.00/);
  assert.ok(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').isDisabled(), "send waits for the review");
  await sheet.locator("header button").click();
  assert.match(await list.locator("ol > li").first().innerText(), /\$1,250 saved/);
  await list.locator("ol > li button").first().click();

  // 2. Fill and review: the price is on page 1, page 2 and the work form.
  await sheet.locator('[data-hpd-smoke="fc-bid-review"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 30000 });
  const b64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await fetch(document.querySelector('[data-hpd-smoke="fc-bid-open"]').href)).arrayBuffer());
    let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s);
  });
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(b64, "base64")), useSystemFonts: true, verbosity: 0 }).promise;
  const pageText = async (n) => (await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str).join(" ");
  for (const n of [1, 2, pdf.numPages]) assert.match(await pageText(n), /1,250\.00/, `price on page ${n}`);

  // 3. Send by fax (asks first), then HumbleFax confirms.
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-status"]').waitFor({ timeout: 20000 });
  assert.match(dialogs.at(-1), new RegExp(`Send the bid for ${omo} at \\$1,250\\.00 to HPD's bid fax \\(212\\) 863-8655\\?[\\s\\S]*submits your bid`));
  assert.equal(faxes.length, 1);
  assert.match(faxes[0].subject, new RegExp(`^Bid - OMO ${omo} - `));
  assert.match(faxes[0].body, /Content-Type: application\/pdf; name="[^"]*_BID_1250_/);
  await page.waitForFunction(() => /Fax confirmed/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-status"]').innerText(), /Sent .* at \$1,250\.00 to HPD fax \(212\) 863-8655/);
  assert.equal(saved[`BID-${omo}`]?.status, "confirmed", "the bid record reached the status server");
  await sheet.locator("header button").click();
  assert.match(await list.locator("ol > li").first().innerText(), /✓ Sent \$1,250/);
  assert.equal(await page.locator(".fc-bid-pin.is-sent").count(), Number.isFinite(bid.lat) ? 1 : 0, "the pin turns green");

  // 4. A failed fax offers Resend.
  const second = list.locator("ol > li button").nth(1);
  const omo2 = (await second.locator("b").first().innerText()).trim();
  failOmo = omo2;
  await second.click();
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("980");
  await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-review"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 30000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click();
  await page.waitForFunction(() => /Fax failed/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').innerText(), /Resend bid by fax/);
  failOmo = "";
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click();
  await page.waitForFunction(() => /Fax confirmed/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-status"]').innerText(), /2 sends/);
  assert.equal(faxes.length, 3);

  // 5. My bids.
  await sheet.locator("header button").click();
  await page.locator('[data-hpd-smoke="fc-bids-mine"]').click();
  const mine = await page.locator('[data-hpd-smoke="fc-my-bids"]').innerText();
  assert.match(mine, /No results yet · 2 sent/);
  assert.ok(mine.includes(omo) && mine.includes(omo2) && /Pending/.test(mine));

  await page.locator('[data-hpd-smoke="fc-bids-close"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".fc-bid-pin").count(), 0);
  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS bids: ${open.length} open (past hidden); ${omo} saved $1,250, package checked, faxed, confirmed, green pin, Sent badge; ${omo2} failed then resent and confirmed; My bids lists both`);
} finally {
  await browser.close();
}
