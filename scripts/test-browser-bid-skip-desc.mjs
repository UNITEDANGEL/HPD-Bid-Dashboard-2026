// ⏭ Skip while reading HPD's description (owner, 18 Nov: "add a skip button when I am reading the description so I don't
// waste time; if I skip, that job goes to the end of the list so I can come back to it at the end"), at iPhone size.
// Three bids due the same day: A's page opens → ⏭ Skip → B opens (map first) → ⏭ Skip → C → ⏭ Skip → back to A, then B.
// And the map stays on the building while a bid is open: saving a price (the pins redraw) no longer pulls it out to
// every pin (18 Nov: "sometimes it does not zoom in and out correctly"). Nothing is faxed.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const usable = fetched.bids.filter((b) => b.itbFile && Number.isFinite(b.lat) && !b.lead).slice(0, 3);
assert.equal(usable.length, 3, "three invitations with their pages");
// Due 9, 10, 11 AM: the line is A, B, C.
const [A, B, C] = usable.map((b, i) => ({ ...b, bidDue: tomorrow, bidDueTime: `${9 + i}:00 AM` }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.addInitScript(() => { try { if (!sessionStorage.getItem("walk-set")) { localStorage.setItem("hpd-bid-walk", "on"); sessionStorage.setItem("walk-set", "1"); } } catch { /* private mode */ } });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [A, B, C] } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let faxes = 0;
  await context.route(/\/api\/drive\/fax-bid/, (r) => { faxes += 1; return r.fulfill({ json: { sent: true } }); });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length > 0, null, { timeout: 60000 });
  // The bids welcome can come in a moment after the list on a busy machine and cover it: wait for it, close it, then
  // open the list again (the first-try failures in the flow check).
  const later = page.locator('[data-hpd-smoke="fc-bids-welcome-later"]');
  await later.waitFor({ timeout: 4000 }).then(() => later.click()).catch(() => {});
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bid-row"]', { hasText: A.omo }).waitFor({ state: "visible", timeout: 15000 });
  const full = page.locator('[data-hpd-smoke="fc-itb-full"]');
  const sheetOmo = async () => (await page.locator('[data-hpd-smoke="fc-bid-sheet"] header strong').innerText()).trim();
  const skip = page.locator('[data-hpd-smoke="fc-itb-skip"]');

  await page.locator('[data-hpd-smoke="fc-bid-row"]', { hasText: A.omo }).click();
  await full.waitFor({ timeout: 30000 });
  assert.equal(await sheetOmo(), A.omo);
  assert.match(await skip.innerText(), new RegExp(`Skip[\\s\\S]*next: ${B.omo} · back at the end \\(2 left\\)`));
  const seen = [A.omo];
  // Skip, skip, skip: B, C, then A again (the skipped one comes back at the end), then B.
  for (const want of [B.omo, C.omo, A.omo, B.omo]) {
    await skip.click();
    await page.locator('[data-hpd-smoke="fc-bid-arriving"]', { hasText: want }).waitFor({ timeout: 10000 });
    await full.waitFor({ timeout: 30000 });
    assert.equal(await sheetOmo(), want);
    seen.push(want);
  }

  // The map stays on the building while you price it: save a price and the pins redraw, the map doesn't move out.
  await page.locator('[data-hpd-smoke="fc-itb-price"]').click();
  await page.waitForTimeout(800);
  const scale = () => page.evaluate(() => Number((document.querySelector(".leaflet-proxy")?.style.transform.match(/scale\(([\d.]+)\)/) || [])[1] || 0));
  const at = await scale();
  await page.locator('[data-hpd-smoke="fc-bid-price"]').fill("1250");
  await page.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await page.waitForTimeout(1500);
  assert.equal(await scale(), at, "the map stayed on the building after saving");
  assert.equal(faxes, 0, "nothing faxed");
  assert.deepEqual(errors, []);
  console.log(`PASS ⏭ skip while reading: ${seen.join(" → ")} (each skip opens the next, the skipped ones come back at the end); saving a price kept the map on the building; nothing faxed`);
} finally {
  await browser.close();
}
