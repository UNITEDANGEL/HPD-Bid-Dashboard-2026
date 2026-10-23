// Browser test of Invitations to bid at iPhone size, the full flow: the envelope flips the map to the
// open bids (past ones hidden), a bid opens with its due date, description and invitation; save a
// price, fill and review the package (checked inside the PDF), send it by fax (HumbleFax, Gmail and the
// status server are all faked here: nothing is sent), see "Fax confirmed", the green pin and the
// "Sent" badge; a failed fax offers Resend; My bids lists them. Needs the app running.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

// A price far above what wins jobs like this asks for a second tap on Save (the app's warning).
async function saveBid(scope) {
  const btn = scope.locator('[data-hpd-smoke="fc-bid-save"]');
  await btn.click();
  if (/Tap again/.test(await btn.innerText().catch(() => ""))) await btn.click();
}
const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  const saved = {};
  // The status server is busy on the first try (as it can be); the bids screen tries again. It holds a
  // bid saved on another phone, which must show in My bids.
  let overridesCalls = 0;
  const otherPhone = { omo: "ER99999", address: "1 OTHER PHONE ST", borough: "BK", bidDue: "2026-10-01", bidDueTime: "10:00 AM", price: 777, savedAt: "2026-09-30T12:00:00Z", status: "confirmed", sentAt: "2026-09-30T12:00:00Z", sentPrice: 777, attempts: 1, updatedAt: "2026-09-30T12:05:00Z" };
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, async (r) => {
    if (r.request().method() === "POST") { const b = JSON.parse(r.request().postData() || "{}"); saved[b.key] = b.patch; }
    else if (/\/overrides/.test(r.request().url()) && ++overridesCalls === 1) return r.fulfill({ status: 503, body: "busy" });
    return r.fulfill({ json: { ok: true, overrides: { "BID-ER99999": otherPhone }, accepted: [] } });
  });
  // Only bids that can still be sent show: two already-past ones are slipped into the real list.
  const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const nyDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const today = nyDay(new Date()), yesterday = nyDay(new Date(Date.now() - 86400000)), tomorrow = nyDay(new Date(Date.now() + 86400000));
  const clockNow = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const mins = (t) => { const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]) : 1440; };
  const stillOpenNow = (b) => b.bidDue > today || (b.bidDue === today && mins(b.bidDueTime) > clockNow[0] * 60 + clockNow[1]);
  // Late in the day all of today's invitations can be past due: then the test moves the real ones to
  // tomorrow (test only), so the full flow always runs on real invitations and their PDFs.
  // Bids due within 3 hours move to tomorrow too: the flow (failed fax -> automatic resend, which only happens before
  // the deadline) must not race a real 11:30 deadline (20 Oct: CI ran at 11:29).
  const soon = (b) => b.bidDue === today && mins(b.bidDueTime) - (clockNow[0] * 60 + clockNow[1]) < 180;
  const real = { ...fetched, bids: fetched.bids.map((b) => (stillOpenNow(b) && !soon(b) ? b : { ...b, bidDue: tomorrow })) };
  const past = [{ ...real.bids[0], omo: "PAST01", bidDue: yesterday, bidDueTime: "11:00 AM" }, { ...real.bids[0], omo: "PAST02", bidDue: today, bidDueTime: "12:01 AM" }];
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...real, bids: [...past, ...real.bids], unread: [{ file: 'ER09999_101326.pdf', omo: 'ER09999', why: 'no bid due date' }] } }));
  // Fax: the request is checked and answered here; status is "confirmed" for the first bid, "failed" for the second.
  const faxes = [];
  let failOmo = "", waitOmo = "";
  await context.route(/\/api\/drive\/fax-bid/, (r) => {
    faxes.push({ subject: decodeURIComponent(r.request().headers()["x-hpd-subject"] || ""), line: r.request().headers()["x-hpd-fax-line"] || "", body: r.request().postData() || "" });
    return r.fulfill({ json: { sent: true, to: "2128638655@humblefax.com", messageId: `m${faxes.length}`, sentAt: new Date().toISOString() } });
  });
  await context.route(/\/api\/drive\/fax-status/, (r) => {
    const { omo } = JSON.parse(r.request().postData() || "{}");
    if (omo === waitOmo) return r.fulfill({ json: { status: "waiting" } });
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
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  await list.locator("li").first().waitFor({ timeout: 20000 });
  // One slim line (23 Oct, max map); the 📅 pill opens the days and the details.
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-banner"] strong').innerText(), new RegExp(`${open.length} bids · \\d+ today`));
  await page.locator('[data-hpd-smoke="fc-bids-day-pick"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-banner"]').innerText(), new RegExp(`${open.length} open to bid · due today or later`));
  // How many arrived today (to compare with the inbox), and an invitation the reader couldn't read is shown, not dropped.
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-today"]').innerText(), /\d+ received today/);
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-unread"]').innerText(), /1 invitation couldn.t be read.*ER09999 \(no bid due date\)/);
  assert.equal(await list.locator("ol > li").count(), open.length);
  assert.ok(!/PAST01|PAST02/.test(await list.innerText()), "past bids are not shown");
  assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector(".leaflet-marker-pane")).visibility === "hidden"), "job pins hidden");

  // Easy win (depends on tonight's invitations): the chip on the list and the explanation in the bid.
  // Easy win tags appear once the award history has loaded.
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => e.name.includes("market_awards.json") && e.responseEnd > 0), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const easyChips = list.locator('[data-hpd-smoke="fc-bid-easy-chip"]');
  let easyChecked = "none today";
  const rowsAll = list.locator("ol > li");
  for (let i = 0; i < await rowsAll.count(); i++) {
    const t = await rowsAll.nth(i).innerText();
    assert.ok(/Easy win · ~\$[\d,]+|Best ~\$[\d,]+ \(wins ~\d+%\) · middle \$[\d,]+/.test(t), `prediction on every row: ${t.split("\n")[0]}`);
  }
  // Every easy-win invitation with a map location has the green $ pin, and no other pin does.
  const easyRows = list.locator("ol > li").filter({ has: page.locator('[data-hpd-smoke="fc-bid-easy-chip"]') });
  const easyOmos = [];
  for (let i = 0; i < await easyRows.count(); i++) easyOmos.push((await easyRows.nth(i).locator("b").first().innerText()).trim());
  const easyMapped = easyOmos.filter((o) => Number.isFinite(open.find((b) => b.omo === o)?.lat)).length;
  assert.equal(await page.locator(".fc-bid-pin.is-easy").count(), easyMapped, `easy-win pins (${easyOmos.join(", ") || "none"})`);
  for (const o of easyOmos.filter((o) => Number.isFinite(open.find((b) => b.omo === o)?.lat))) {
    assert.ok(await page.locator(`.fc-bid-pin.is-easy[title^="${o} "]`).count() === 1, `pin for ${o}`);
  }
  if (await easyChips.count()) {
    const row = list.locator("ol > li").filter({ has: page.locator('[data-hpd-smoke="fc-bid-easy-chip"]') }).first();
    const chipPrice = (await easyChips.first().innerText()).match(/\$[\d,]+/)[0];
    await row.locator("button").first().click();
    const easyBox = page.locator('[data-hpd-smoke="fc-bid-easy"]');
    await easyBox.waitFor({ timeout: 10000 });
    const easyText = await easyBox.innerText();
    assert.ok(easyText.includes(`Easy win: bid this one · ~${chipPrice}`), easyText);
    assert.match(easyText, /of your wins[\s\S]*beaten \d+ of those \d+ winners/);
    easyChecked = chipPrice;
    await page.locator('[data-hpd-smoke="fc-bid-sheet"] header button').first().click();
  }

  // 1. Save a price.
  await list.locator("ol > li > button:first-child").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  // After a send the sheet goes back to the bids map by itself (23 Oct): wait for that, close it otherwise.
  const closeSheet = async () => { for (let i = 0; i < 12 && (await sheet.count()); i++) await page.waitForTimeout(250); if (await sheet.count()) await sheet.locator("header button").first().click({ timeout: 3000 }).catch(() => {}); };
  await sheet.waitFor();
  const omo = (await sheet.locator("header strong").innerText()).trim();
  const bid = open.find((b) => b.omo === omo);
  // The whole description, word for word (numbered items and HPD's notes start new lines).
  // HPD's text is folded away (the page pictures show it): "Show HPD's text" opens it.
  await sheet.locator('[data-hpd-smoke="fc-bid-text-toggle"]').click();
  const shownDesc = (await sheet.locator('[data-hpd-smoke="fc-bid-description"]').innerText()).trim();
  // A phone in HPD's text is hidden in the public copy and shown when signed in: compare without phone numbers.
  const noPhone = (t) => t.replace(/\(phone: sign in to see\)|\(?\b\d{3}\)?[ .-]?\d{3}[ .-]\d{4}\b/g, "#").replace(/\s+/g, " ").trim();
  assert.equal(noPhone(shownDesc), noPhone(bid.description), "nothing missing or changed");
  // The invitation link opens HPD's PDF through the signed-in private route (fetched like the phone does).
  const viewHref = await sheet.locator('[data-hpd-smoke="fc-bid-view"]').getAttribute("href");
  assert.match(viewHref, /^\/api\/private\/itb\//);
  assert.deepEqual(await page.evaluate(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return [r.status, String.fromCharCode(...b.slice(0, 5))]; }, viewHref), [200, "%PDF-"]);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-review"]').count(), 0, "review comes after saving a price");
  // The price help says what it read in the job and how good the match is.
  assert.ok(await sheet.locator('[data-hpd-smoke="fc-job-sum"] li').count() >= 1, "The job lists the work");
  // One card: the building's picture / 360° on top, jump buttons, the building section below the price.
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-jump"] button').count(), 4);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-building"]').count(), 1);
  await sheet.locator('[data-hpd-smoke="fc-bid-jump"] button', { hasText: "Building" }).click();
  // Jumps straight to the section.
  await page.waitForFunction(() => { const r = document.querySelector('[data-hpd-smoke="fc-bid-building"]').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 80; }, null, { timeout: 8000 });
  if (await sheet.locator('[data-hpd-smoke="fc-bid-help"]').count()) {
    assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-confidence"]').innerText(), /Good match|Fair match|Rough guide/);
    assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-why"]').innerText(), /awarded/);
    assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-targets"]').innerText(), /Win most[\s\S]*wins ~\d+%/);
    await sheet.locator('[data-hpd-smoke="fc-bid-similar-toggle"]').click();
    const similar = sheet.locator('[data-hpd-smoke="fc-bid-similar"] li');
    assert.ok(await similar.count() >= 2, "past jobs like this are listed");
    assert.match(await similar.first().innerText(), /\$[\d,]+[\s\S]*(you won|other contractor)/);
  }
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("1250");
  await saveBid(sheet);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-saved"]').innerText(), /Price saved: \$1,250\.00/);
  assert.ok(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').isDisabled(), "send waits for the review");
  await closeSheet();
  await openBidList(page);
  assert.match(await list.locator("ol > li").first().innerText(), /\$1,250 saved/);
  await list.locator("ol > li > button:first-child").first().click();

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
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').innerText(), /Tap again to send the bid at \$1,250\.00 to HPD/, "first tap asks for a second");
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click(); // second tap (no confirm boxes: iPhone blocks them)
  await sheet.locator('[data-hpd-smoke="fc-bid-status"]').waitFor({ timeout: 20000 });
  assert.equal(dialogs.length, 0, "no confirm boxes");
  assert.equal(faxes.at(-1).line, "main", "first send goes to (212) 863-8655");
  assert.equal(faxes.length, 1);
  assert.match(faxes[0].subject, new RegExp(`^Bid - OMO ${omo} - `));
  assert.match(faxes[0].body, /Content-Type: application\/pdf; name="[^"]*_BID_1250_/);
  await page.waitForFunction(() => /Fax confirmed/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-status"]').innerText(), /Sent .* at \$1,250\.00 to HPD fax \(212\) 863-8655/);
  assert.equal(saved[`BID-${omo}`]?.status, "confirmed", "the bid record reached the status server");
  // Sent: the sheet goes back to the bids map by itself (23 Oct); close it if it's still up.
  await page.waitForTimeout(2600);
  await closeSheet();
  assert.equal(await sheet.count(), 0, "back on the bids map");
  assert.match(await page.locator('[data-hpd-smoke="fc-bid-sent-note"]').innerText(), new RegExp(`${omo} sent to HPD · \\$1,250\\.00`));
  await openBidList(page); // the list folded down to show the map
  assert.match(await list.locator("ol > li").first().innerText(), /✓ Fax confirmed · \$1,250/);
  assert.equal(await page.locator(".fc-bid-pin.is-sent").count(), Number.isFinite(bid.lat) ? 1 : 0, "the pin turns green");

  // 4. A failed fax offers Resend.
  const second = list.locator("ol > li > button:first-child").nth(1);
  const omo2 = (await second.locator("b").first().innerText()).trim();
  failOmo = omo2;
  await second.click();
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("980");
  await saveBid(sheet);
  await sheet.locator('[data-hpd-smoke="fc-bid-review"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 30000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click(); // second tap (no confirm boxes: iPhone blocks them)
  await page.waitForFunction(() => /Fax failed/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').innerText(), /Resend bid by fax/);
  assert.equal(await page.locator(".fc-bid-pin.is-fax-failed").count(), Number.isFinite(open.find((b) => b.omo === omo2)?.lat) ? 1 : 0, "a failed fax shows a red pin");
  failOmo = "";
  // The failed fax goes again BY ITSELF to HPD's next line (HumbleFax to 863-7804), same price, and gets confirmed
  // (owner, 19 Oct: "this should be auto resend and confirm"); the record says it was automatic.
  await page.waitForFunction(() => /Fax confirmed/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 180000 });
  assert.equal(faxes.at(-1).line, "7804", "sent again to the backup line");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-log"]').innerText(), /Fax sent again automatically to HPD \(212\) 863-7804/);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-status"]').innerText(), /2 sends/);
  assert.equal(faxes.length, 3);

  // 4b. Revise the first bid: $1,250 -> $1,100. The old price is crossed out with initials and the
  // revision date, and the cover tells HPD to disregard the earlier price.
  await closeSheet();
  await openBidList(page);
  await list.locator("ol > li > button:first-child").first().click();
  // Sent and confirmed: the price is locked, the package can't be sent again, the only way is Revise.
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-locked"]').innerText(), /Sent to HPD at \$1,250\.00/);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-price"]').isDisabled(), true);
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').isDisabled(), true);
  await sheet.locator('[data-hpd-smoke="fc-bid-revise"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-revise"]').click(); // second tap (no confirm boxes: iPhone blocks them)
  await sheet.locator('[data-hpd-smoke="fc-bid-revising"]').waitFor();
  await page.waitForFunction(() => /Revision started \(HPD has \$1,250\.00\)/.test(document.querySelector('[data-hpd-smoke="fc-bid-log"]')?.textContent || ""), null, { timeout: 10000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("1100");
  await saveBid(sheet);
  await page.waitForFunction(() => /revised/.test(document.querySelector('[data-hpd-smoke="fc-bid-saved"]')?.textContent || ""), null, { timeout: 10000 });
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-saved"]').innerText(), /HPD has \$1,250\.00: fill and send the revised bid/);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-review"]').innerText(), /Fill the revised package: \$1,250\.00 → \$1,100\.00/);
  await sheet.locator('[data-hpd-smoke="fc-bid-review"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 30000 });
  const revB64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await (await fetch(document.querySelector('[data-hpd-smoke="fc-bid-open"]').href)).arrayBuffer());
    let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s);
  });
  const revPdf = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(revB64, "base64")), useSystemFonts: true, verbosity: 0 }).promise;
  const revText = (await (await revPdf.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
  assert.ok(revText.includes("1,250.00") && revText.includes("1,100.00") && revText.includes("JS") && /PRICE REVISED 1X ON \d+\/\d+\/\d+/.test(revText), "revised page 1");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-send"]').innerText(), /Send revised bid/);
  const faxesBefore = faxes.length;
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click(); // second tap (no confirm boxes: iPhone blocks them)
  // The card still says "Fax confirmed" from the first send: wait for the confirmation of the $1,100 fax.
  await page.waitForFunction(() => { const t = document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""; return /Fax confirmed/.test(t) && /1,100\.00/.test(t); }, null, { timeout: 15000 });
  for (let i = 0; i < 50 && saved[`BID-${omo}`]?.status !== "confirmed"; i++) await page.waitForTimeout(100);
  assert.equal(faxes.length, faxesBefore + 1, "one revised fax sent");
  assert.equal(dialogs.length, 0, "no confirm boxes");
  assert.match(faxes.at(-1).subject, new RegExp(`^REVISED Bid - OMO ${omo} - `));
  const coverText = Buffer.from(faxes.at(-1).body.split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\s+/g, ""), "base64").toString("utf8");
  assert.match(coverText, /^REVISED BID for OMO [\s\S]*Please disregard our previous bid of \$1,250\.00\.\nOur new bid price is \$1,100\.00\./);
  assert.deepEqual(saved[`BID-${omo}`]?.revisions?.map((r) => r.price), [1250], "the revision is recorded");

  // 5. My bids.
  await closeSheet();
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-mine"]').click();
  const mine = await page.locator('[data-hpd-smoke="fc-my-bids"]').innerText();
  assert.match(mine, /3 sent/);
  assert.ok(mine.includes(omo) && mine.includes(omo2) && /Awaiting award/.test(mine));
  assert.match(mine, /revised 1x/);
  assert.ok(mine.includes("ER99999") && mine.includes("1 OTHER PHONE ST"), "a bid from another phone shows after the server was busy once");

  // 5b. HumbleFax emailed "sent successfully" but the app can't read the email yet: the owner taps
  // "I got HumbleFax's confirmation email" and the fax shows confirmed.
  await page.locator('[data-hpd-smoke="fc-bids-close"]').click();
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await openBidList(page);
  await page.getByRole("tab", { name: /^Open/ }).click();
  const third = list.locator("ol > li > button:first-child").nth(2);
  waitOmo = (await third.locator("b").first().innerText()).trim();
  await third.click();
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("700");
  await saveBid(sheet);
  await sheet.locator('[data-hpd-smoke="fc-bid-review"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 30000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-send"]').click(); // second tap (no confirm boxes: iPhone blocks them)
  await page.waitForFunction(() => /waiting for HumbleFax/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 15000 });
  await sheet.locator('[data-hpd-smoke="fc-bid-mark-confirmed"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-mark-confirmed"]').click(); // second tap (no confirm boxes: iPhone blocks them)
  await page.waitForFunction(() => /Fax confirmed[\s\S]*Confirmed by you/.test(document.querySelector('[data-hpd-smoke="fc-bid-status"]')?.textContent || ""), null, { timeout: 10000 });
  assert.equal(saved[`BID-${waitOmo}`]?.status, "confirmed");
  await closeSheet();
  await openBidList(page);

  // 6. Bid stats: every awarded invitation with the winning price, by kind of work and area.
  await page.locator('[data-hpd-smoke="fc-bids-stats"]').click();
  // Stats opens on Progress (today + the last 7 days), each page on its own.
  const prog = page.locator('[data-hpd-smoke="fc-progress"]');
  await prog.waitFor({ timeout: 10000 });
  assert.match(await prog.locator('[data-hpd-smoke="fc-progress-today"]').innerText(), /Today · \d+ due[\s\S]*priced[\s\S]*sent[\s\S]*confirmed[\s\S]*to go/);
  assert.equal(await prog.locator('[data-hpd-smoke="fc-progress-day"]').count(), 7);
  assert.equal(await page.locator('[data-hpd-smoke="fc-bid-stats"]').count(), 0, "wins & prices are on their own page");
  await page.locator('[data-hpd-smoke="fc-stats-sub-prices"]').click();
  const stats = page.locator('[data-hpd-smoke="fc-bid-stats"]');
  await stats.waitFor({ timeout: 20000 });
  assert.match(await stats.innerText(), /invitations won/);
  assert.ok(await page.locator('[data-hpd-smoke="fc-stats-trade"] tbody tr').count() >= 5, "kinds of work listed");
  assert.ok(await page.locator('[data-hpd-smoke="fc-stats-boro"] tbody tr').count() >= 5, "boroughs listed");
  assert.ok(await page.locator('[data-hpd-smoke="fc-stats-losses"] li').count() >= 10, "recent jobs won by others");
  assert.match(await page.locator('[data-hpd-smoke="fc-stats-should"]').innerText(), /\d+ jobs[\s\S]*went to other contractors for more than you usually charge/);
  assert.ok(await page.locator('[data-hpd-smoke="fc-stats-should"] li').count() >= 5, "should-have-bid jobs listed");
  assert.match(await page.locator('[data-hpd-smoke="fc-stats-should"] li').first().innerText(), /E[QR]\d{5} · won at \$[\d,]+ · your usual \$[\d,]+/);
  assert.ok(await page.locator('[data-hpd-smoke="fc-stats-prices"] tbody tr').count() >= 10, "price list rows");
  assert.match(await page.locator('[data-hpd-smoke="fc-stats-prices"] tbody tr').first().innerText(), /\d+ wins[\s\S]*\d+ jobs[\s\S]*beats \d+\/\d+/);

  // Win rate by month matches the data file.
  const marketData = (await (await fetch(`${baseUrl}/data/market_awards.json`)).json()).jobs;
  const firstMonthRow = page.locator('[data-hpd-smoke="fc-stats-months"] tbody tr').first();
  const newestMonth = marketData.map((j) => j.awardDate.slice(0, 7)).filter((m, _, all) => all.filter((x) => x === m).length >= 5).sort().at(-1);
  const inMonth = marketData.filter((j) => j.awardDate.startsWith(newestMonth));
  assert.match(await firstMonthRow.innerText(), new RegExp(`${inMonth.filter((j) => j.won).length} of ${inMonth.length}`), `win rate row for ${newestMonth}`);

  // 6b. Price history: tap a price-list row, see months with both series, tap a month, open the table.
  await page.locator('[data-hpd-smoke="fc-price-row"]').first().click();
  const wh = page.locator('[data-hpd-smoke="fc-work-history"]');
  await wh.waitFor({ timeout: 10000 });
  assert.match(await wh.innerText(), /You[\s\S]*Other winners/);
  assert.ok(await wh.locator("svg path.line.is-others").count() === 1 && await wh.locator("svg circle.dot").count() >= 6, "both lines and monthly dots drawn");
  const rects = wh.locator("svg rect");
  await rects.nth(await rects.count() - 2).click();
  assert.match(await page.locator('[data-hpd-smoke="fc-work-tip"]').innerText(), /other winners (\$[\d,]+ \(\d+ jobs?\)|none) · you (\$[\d,]+ \(\d+ wins?\)|none)/);
  await wh.getByText("Show as a table").click();
  assert.ok(await page.locator('[data-hpd-smoke="fc-work-table"] tbody tr').count() >= 3, "table view of the months");
  assert.match(await wh.locator(".fc-workhist-jobs li").first().innerText(), /E[QR]\d{5} · \$[\d,]+ · (you won|other contractor)/);

  // 7. History: every awarded invitation, checked against the raw data file.
  const market = (await (await fetch(`${baseUrl}/data/market_awards.json`)).json()).jobs;
  await page.locator('[data-hpd-smoke="fc-bids-history"]').click();
  const summary = page.locator('[data-hpd-smoke="fc-history-summary"]');
  await summary.waitFor({ timeout: 20000 });
  assert.match(await summary.innerText(), new RegExp(`^${market.length.toLocaleString("en-US")} jobs`));
  await page.locator('[data-hpd-smoke="fc-history-who"]').selectOption("you");
  assert.match(await summary.innerText(), new RegExp(`^${market.filter((j) => j.won).length} jobs`), "You won = your awards in the data");
  await page.locator('[data-hpd-smoke="fc-history-who"]').selectOption("all");
  const pick = market.find((j) => !j.won);
  await page.locator('[data-hpd-smoke="fc-history-search"]').fill(pick.omo);
  assert.match(await summary.innerText(), /^1 jobs/);
  const item = page.locator('[data-hpd-smoke="fc-history"] .fc-history-list li').first();
  assert.ok((await item.innerText()).includes(`${pick.omo} · $${pick.amount.toLocaleString("en-US")}`) && /other contractor/.test(await item.innerText()));
  await item.locator("button").first().click();
  assert.equal((await page.locator('[data-hpd-smoke="fc-history-desc"]').innerText()).trim(), pick.description.trim());

  await page.locator('[data-hpd-smoke="fc-bids-close"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".fc-bid-pin").count(), 0);
  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS bids: ${open.length} open (past hidden); ${omo} saved $1,250, package checked, faxed, confirmed, green pin, Sent badge, then revised to $1,100 (old price crossed out, cover says disregard); ${omo2} failed then resent automatically to 863-7804 and confirmed; My bids lists both; Bid stats shows; History matches the data; easy win ${easyChecked}`);
} finally {
  await browser.close();
}
