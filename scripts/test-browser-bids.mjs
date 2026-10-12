// Browser test of Invitations to bid at iPhone size: the envelope flips the map to the upcoming bids
// (banner, pins, list), a bid opens with its due date, description and invitation link, price help
// shows, one price fills the package (checked inside the PDF: page 1, page 2 and the last page carry
// it, with the company details), and "Back to jobs" brings the job pins back. Sealed off from the
// status server. Needs the app running. BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { localStorage.removeItem("hpd-bid-prices-v1"); sessionStorage.setItem("seeded", "1"); } });
  // Only bids that can still be submitted show: two that are already past are slipped into the
  // real list (due yesterday, and due today at 12:01 AM) and must not appear.
  const real = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const nyDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const today = nyDay(new Date()), yesterday = nyDay(new Date(Date.now() - 86400000));
  const past = [{ ...real.bids[0], omo: "PAST01", bidDue: yesterday, bidDueTime: "11:00 AM" }, { ...real.bids[0], omo: "PAST02", bidDue: today, bidDueTime: "12:01 AM" }];
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...real, bids: [...past, ...real.bids] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  const minutes = (t) => { const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(t || ""); return m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]) : 1440; };
  const open = real.bids.filter((b) => b.bidDue > today || (b.bidDue === today && minutes(b.bidDueTime) > clock[0] * 60 + clock[1]));
  const data = { bids: open };
  const mapped = open.filter((b) => Number.isFinite(b.lat));
  assert.ok(open.length > 0, "there are open bids to show");

  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });

  // Flip to bids.
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await page.locator('[data-hpd-smoke="fc-bids-list"] li').first().waitFor({ timeout: 20000 });
  const banner = await page.locator('[data-hpd-smoke="fc-bids-banner"]').innerText();
  assert.match(banner, new RegExp(`${open.length} open to bid · due today or later`));
  await page.waitForFunction((n) => document.querySelectorAll(".fc-bid-pin").length === n, mapped.length, { timeout: 20000 });
  const jobPinsHidden = await page.evaluate(() => getComputedStyle(document.querySelector(".leaflet-marker-pane")).visibility === "hidden");
  assert.ok(jobPinsHidden, "job pins hidden while bids show");
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-list"] li').count(), open.length);
  const listed = await page.locator('[data-hpd-smoke="fc-bids-list"]').innerText();
  assert.ok(!/PAST01|PAST02/.test(listed), "bids already past their due time are not shown");
  assert.ok(!/ago|award pending/.test(listed), "nothing in the list is past due");

  // Open the first bid in the list (soonest due).
  await page.locator('[data-hpd-smoke="fc-bids-list"] li button').first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.waitFor();
  const omo = (await sheet.locator("header strong").innerText()).trim();
  const bid = data.bids.find((b) => b.omo === omo);
  assert.ok(bid, `sheet shows a known bid (${omo})`);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bid-due"]').innerText(), /Bid due .* · (due|due today|due tomorrow|due in)/);
  assert.equal((await sheet.locator('[data-hpd-smoke="fc-bid-description"]').innerText()).trim(), bid.description);
  const view = await sheet.locator('[data-hpd-smoke="fc-bid-view"]').getAttribute("href");
  assert.equal((await page.request.get(baseUrl + view)).status(), 200, "the invitation opens");

  // One price fills the package.
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("1250");
  await sheet.locator('[data-hpd-smoke="fc-bid-fill"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 30000 });
  const b64 = await page.evaluate(async () => {
    const url = document.querySelector('[data-hpd-smoke="fc-bid-open"]').href;
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s);
  });
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(b64, "base64")), useSystemFonts: true }).promise;
  const pageText = async (n) => (await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str).join(" ");
  const [p1, p2, last] = [await pageText(1), await pageText(2), await pageText(pdf.numPages)];
  assert.match(p1, /1,250\.00/, "page 1 BID PRICE");
  assert.match(p1, /United Angel Construction Corp\./);
  assert.match(p1, /718-989-1381/);
  assert.match(p2, /1,250\.00/, "page 2 PAGE TOTAL AMOUNT");
  assert.match(last, /1,250\.00/, "Work Description Form BID AMOUNT");
  assert.match(last, /REMOVE ALL WORK RELATED DEBRIS/);
  assert.equal(pdf.numPages, bid.pages);

  // The price is kept on this phone and shows in the list; back to jobs restores the job pins.
  await sheet.locator("header button").click();
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-list"] li').first().innerText(), /your price \$1250/);
  await page.locator('[data-hpd-smoke="fc-bids-close"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".fc-bid-pin").count(), 0, "bid pins gone");
  assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector(".leaflet-marker-pane")).visibility !== "hidden"), "job pins back");

  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS bids: ${open.length} open invitations (past ones hidden) (${mapped.length} pins), ${omo} opened with description and invitation, $1,250 filled on page 1, page 2 and the work form (${pdf.numPages} pages), back to jobs`);
} finally {
  await browser.close();
}
