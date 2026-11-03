// 👋 Tapping Bids (owner, 3 Nov: "it should give me a nice little message: let's start the bidding process, these are
// what's due, whatever is next ... you want to start?"), at iPhone size: the hello says how many still need a price and
// the next one; ▶ Start flies the map to it and opens HPD's work description; Later hides it.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const order = { omo: "ER09499", bidDue: tomorrow, bidDueTime: "11:00 AM", address: "47-46 40 STREET", borough: "QN", itbFile: "ER09499_103026111433.pdf", description: "APARTMENT #1H ENTRANCE DOOR RE-ALIGN DOOR REPLACE ALL HINGES", notes: "", descPages: [2], pages: 4, lat: 40.74051, lng: -73.925196 };
const other = fetched.bids.find((b) => b.itbFile && Number.isFinite(b.lat) && b.omo !== "ER09499" && (b.descPages || [3])[0] === 3);
assert.ok(other, "an invitation with its job description on page 3");
const bids = [order, { ...other, bidDue: tomorrow, bidDueTime: "11:00 AM" }];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.addInitScript(() => { try { if (!sessionStorage.getItem("walk-set")) { localStorage.setItem("hpd-bid-walk", "on"); sessionStorage.setItem("walk-set", "1"); } } catch { /* private mode */ } });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin").length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // Tapping Bids starts with a hello: what's left to bid and the next one.
  const hello = page.locator('[data-hpd-smoke="fc-bids-welcome"]');
  await hello.waitFor({ timeout: 15000 });
  assert.match(await hello.innerText(), /Let's start bidding/);
  assert.equal((await page.locator('[data-hpd-smoke="fc-bids-welcome-count"]').innerText()).trim(), "2 invitations still need a price: 2 due tomorrow.");
  assert.match(await page.locator('[data-hpd-smoke="fc-bids-welcome-next"]').innerText(), /^Next: ER\d{5} · /);
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-welcome-all"]').count(), 1, "bid all in a row");
  const r = await hello.boundingBox();
  assert.ok(r && r.x >= 0 && r.x + r.width <= 390, "fits the iPhone");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/bids-welcome.png` }).catch(() => {});
  // ▶ Start: the map flies to the building, then HPD's work description opens.
  const nextOmo = (await page.locator('[data-hpd-smoke="fc-bids-welcome-next"]').innerText()).match(/ER\d{5}/)[0];
  await page.locator('[data-hpd-smoke="fc-bids-welcome-start"]').click();
  await page.locator('[data-hpd-smoke="fc-bid-arriving"]').waitFor({ timeout: 5000 });
  assert.equal(await hello.count(), 0, "the hello goes");
  assert.match(await page.locator('[data-hpd-smoke="fc-bid-arriving"]').innerText(), new RegExp(nextOmo));
  await page.locator('[data-hpd-smoke="fc-itb-full"]').waitFor({ timeout: 30000 });
  // Later: closing the bids and opening them again shows the hello again; Later hides it.
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await hello.waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="fc-bids-welcome-later"]').click();
  assert.equal(await hello.count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS bids welcome: tapping Bids says how many still need a price and the next one; Start flies to it and opens the work description; Later hides it");
} finally {
  await browser.close();
}
