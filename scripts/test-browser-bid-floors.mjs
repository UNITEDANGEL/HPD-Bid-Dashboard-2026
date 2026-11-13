// 🏢 Floors from the building facts in the bid calculator (plan, Next level item B, 12 Nov): a walk-up with no floor
// in HPD's words takes it from the apartment (APT 5A in a 6-floor walk-up = 5th floor, 3 above the 2nd); in an
// elevator building there is no floors-up charge, and the calculator says why. NYC Open Data is answered here.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const base = fetched.bids[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function open(cls, description) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [{ ...base, omo: "EQ99981", bidDue: tomorrow, bidDueTime: "11:00 AM", itbFile: "", description }] } }));
  await c.route(/geosearch\.planninglabs\.nyc/, (r) => r.fulfill({ json: { features: [{ properties: { addendum: { pad: { bbl: "1019660042", bin: "1059533" } } } }] } }));
  await c.route(/data\.cityofnewyork\.us\/resource\/64uk-42ks/, (r) => r.fulfill({ json: [{ yearbuilt: "1920", numfloors: "6.0000000", unitsres: "20", bldgclass: cls }] }));
  await c.route(/data\.cityofnewyork\.us\/resource\/wvxf-dwi5/, (r) => r.fulfill({ json: decodeURIComponent(r.request().url()).includes("count(") ? [] : [] }));
  // Your rates: leak $450, $25 a floor above the 2nd.
  await c.addInitScript(() => { localStorage.setItem("hpd-my-rates", JSON.stringify({ leak: 450, "x-floor": 25 })); for (let i = localStorage.length - 1; i >= 0; i--) if (localStorage.key(i)?.startsWith("hpd-building-")) localStorage.removeItem(localStorage.key(i)); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bid-row"]').first().click();
  await page.locator('[data-hpd-smoke="fc-bldg-facts"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="fc-my-price"]').waitFor({ timeout: 20000 });
  return { c, page, errors };
}

try {
  const desc = "APT 5A BATHROOM: TRACE AND REPAIR LEAK AT CEILING. ALL WORK MUST BE DONE AS PER HPD SPECIFICATIONS.";
  // 1. Walk-up (class C): apartment 5A = 5th floor.
  let { c, page, errors } = await open("C7", desc);
  const row = page.locator('[data-hpd-smoke="fc-my-row"][data-key="x-floor"]');
  await row.waitFor({ timeout: 15000 });
  const walkText = await row.innerText();
  assert.match(walkText, /Floors up the stairs \(apartment 5A: 5th floor of a 6-floor walk-up: 3 above the 2nd\)[\s\S]*\$75/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-calc-floorwhy"]').count(), 0);
  assert.deepEqual(errors, []);
  await c.close();
  // 2. Elevator building (class D), HPD names the 5th floor: no floors-up line, and the calculator says why.
  ({ c, page, errors } = await open("D1", desc.replace("APT 5A BATHROOM", "APT 5A 5TH FLOOR BATHROOM")));
  const why = page.locator('[data-hpd-smoke="fc-calc-floorwhy"]');
  await why.waitFor({ timeout: 15000 });
  assert.equal(await why.innerText(), "🏢 No floors-up charge: elevator building: no stairs to carry up (building facts).");
  assert.equal(await page.locator('[data-hpd-smoke="fc-my-row"][data-key="x-floor"]').count(), 0, "no floors-up line");
  assert.deepEqual(errors, []);
  await c.close();
  console.log(`PASS bid floors: walk-up "${walkText.split("\n")[0]}" ($25 × 3); elevator building: no floors-up charge, said why`);
} finally {
  await browser.close();
}
