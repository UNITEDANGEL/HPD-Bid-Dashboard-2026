// Browser test at iPhone size: open an invitation and see the building box (year built, floors,
// walk-up, apartments, open HPD violations, the ones matching the work, HPD Online link). NYC GeoSearch
// and Open Data are answered here. A failed lookup says so and "Try again" loads it; the bid still works.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  // Every bid open tomorrow, so the list always has them.
  const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
  // The first bid's work is fixed (glass at the entrance door), so the matching violations don't depend on the
  // day's invitations.
  const bids = fetched.bids.map((b, i) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM", ...(i === 0 ? { omo: "EQ99990", description: "PUBLIC PARTS REPLACE CRACKED GLASS AT BUILDING ENTRANCE DOOR PUBLIC HALL 1ST FL. TOTAL GLASS 1" } : {}) /* a job number with no private copy, so the signed-in description doesn't replace this one (21 Oct) */ }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  let down = true, geoCalls = 0;
  await context.route(/geosearch\.planninglabs\.nyc/, (r) => { geoCalls++; return down ? r.fulfill({ status: 503, body: "busy" }) : r.fulfill({ json: { features: [{ properties: { addendum: { pad: { bbl: "1019660042", bin: "1059533" } } } }] } }); });
  await context.route(/data\.cityofnewyork\.us\/resource\/64uk-42ks/, (r) => r.fulfill({ json: [{ yearbuilt: "1901", numfloors: "6.0000000", unitsres: "16", bldgclass: "C7" }] }));
  await context.route(/data\.cityofnewyork\.us\/resource\/wvxf-dwi5/, (r) => {
    const u = decodeURIComponent(r.request().url());
    if (u.includes("count(")) return r.fulfill({ json: [{ class: "A", count: "35" }, { class: "B", count: "80" }, { class: "C", count: "13" }] });
    return r.fulfill({ json: [
      { class: "C", apartment: "", inspectiondate: "2026-08-28T00:00:00.000", buildingid: "39531", novdescription: "§ 27-2005 HMC: PROPERLY REPAIR OR REPLACE THE CRACKED GLASS AT BUILDING ENTRANCE DOOR AT PUBLIC HALL" },
      { class: "B", apartment: "2A", inspectiondate: "2026-07-01T00:00:00.000", buildingid: "39531", novdescription: "§ 27-2005 HMC: REPAIR THE DOOR CLOSER AT APT 2A" },
      { class: "C", apartment: "", inspectiondate: "2026-10-01T00:00:00.000", buildingid: "39531", novdescription: "§ 27-2017.4 HMC: ABATE THE INFESTATION OF MICE" },
    ] });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-bids-list"]');
  await list.locator("ol > li > button:first-child").first().waitFor({ timeout: 20000 });
  // Pick a bid whose description names a door or glass so matching violations show.
  const pick = bids[0];
  await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith("hpd-building-")) localStorage.removeItem(localStorage.key(i)); });
  await list.locator("ol > li", { hasText: pick.omo }).first().locator("button").first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  const box = sheet.locator('[data-hpd-smoke="fc-bldg"]');

  // 1. Open Data is down: the box says so, the rest of the bid is still there.
  await page.waitForFunction(() => /didn.t load/.test(document.querySelector('[data-hpd-smoke="fc-bldg"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bid-due"]').count(), 1, "bid still shows its due date");
  assert.equal(await sheet.locator('[data-hpd-smoke="jc-hero-360"]').count(), Number.isFinite(pick.lat) ? 1 : 0, "360° view on the building picture");
  // 2. Try again once it's back.
  down = false;
  await box.locator("button", { hasText: "Try again" }).click();
  await sheet.locator('[data-hpd-smoke="fc-bldg-facts"]').waitFor({ timeout: 15000 });
  const year = new Date().getFullYear() - 1901;
  assert.equal(await sheet.locator('[data-hpd-smoke="fc-bldg-facts"]').innerText(), `Built 1901 (${year} yrs) · 6 floors · walk-up · 16 apartments`);
  assert.match(await sheet.locator('[data-hpd-smoke="fc-bldg-viol"]').innerText(), /128 open HPD violations: 13 C \(hazardous\) · 80 B · 35 A/);
  const related = await sheet.locator('[data-hpd-smoke="fc-bldg-related"] li').allInnerTexts();
  assert.ok(related.length >= 1 && related.length <= 3, "1-3 matching violations");
  assert.ok(related.every((t) => !/MICE/.test(t)), "unrelated violations left out");
  assert.ok(related.every((t) => !/§/.test(t)), "code citations removed");
  assert.equal(await sheet.locator(".fc-bldg-link").getAttribute("href"), "https://hpdonline.nyc.gov/hpdonline/building/39531");
  // 3. Reopen: comes from the phone's copy (no new lookup).
  const before = geoCalls;
  await sheet.locator("header button").first().click();
  await list.locator("ol > li", { hasText: pick.omo }).first().locator("button").first().click();
  await sheet.locator('[data-hpd-smoke="fc-bldg-facts"]').waitFor({ timeout: 5000 });
  assert.equal(geoCalls, before, "cached on the phone");
  // HPD's own job-description pages (2-3) in the card; tap one for full screen, zoom, close.
  if (pick.itbFile) {
    await sheet.locator('[data-hpd-smoke="fc-itb-thumb"]').first().waitFor({ timeout: 30000 });
    const thumbs = await sheet.locator('[data-hpd-smoke="fc-itb-thumb"] img').evaluateAll((imgs) => imgs.map((i) => i.naturalWidth));
    assert.ok(thumbs.length >= 1 && thumbs.every((w) => w > 500), `invitation pages drawn (${thumbs})`);
    await sheet.locator('[data-hpd-smoke="fc-itb-thumb"]').first().click();
    const full = page.locator('[data-hpd-smoke="fc-itb-full"]');
    await full.waitFor({ timeout: 5000 });
    await full.locator('[data-hpd-smoke="fc-itb-zoom"]').click();
    assert.equal(await full.locator("img").evaluate((i) => i.style.width), "200%");
    await full.locator('[data-hpd-smoke="fc-itb-close"]').click();
    assert.equal(await full.count(), 0);
  }
  // A glass size in the description shows as a measurement chip (ER07908: 30x26 fire-rated glass).
  if (/30”\s*X\s*26”/i.test(pick.description)) assert.match(await sheet.locator('[data-hpd-smoke="fc-job-sum"]').innerText(), /~5\.4 sq ft of glass/);
  // Fits the iPhone width.
  const overflow = await page.evaluate(() => { const b = document.querySelector('[data-hpd-smoke="fc-bldg"]'); return b.scrollWidth - b.clientWidth; });
  assert.ok(overflow <= 1, `building box overflows by ${overflow}px`);
  // 🏢 The same box on a job card (27 Oct): open a job straight from its link.
  const jobPage = await context.newPage();
  await jobPage.goto(`${baseUrl}/map/?omo=EQ15239&view=all`, { waitUntil: "load", timeout: 180000 });
  await jobPage.locator('#fc-job-card [data-hpd-smoke="fc-bldg-facts"]').waitFor({ state: "attached", timeout: 30000 });
  assert.match(await jobPage.locator('#fc-job-card [data-hpd-smoke="fc-bldg-facts"]').textContent(), /Built 1901 \(\d+ yrs\) · 6 floors/);
  assert.match(await jobPage.locator('#fc-job-card [data-hpd-smoke="fc-bldg-viol"]').textContent(), /128 open HPD violations/);
  await jobPage.close();
  assert.deepEqual(errors, []);
  console.log(`PASS building facts (${pick.omo}): Open Data down -> message + Try again, then built 1901 · 6 floors · walk-up · 16 apartments, 128 open (13 C), ${related.length} matching violation(s), HPD Online link, cached on reopen; invitation pages 2-3 shown, full screen + zoom`);
} finally {
  await browser.close();
}
