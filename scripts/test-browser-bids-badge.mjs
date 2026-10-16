// The Bids button shows how many invitations are open, like the Notices count (owner, 16 Oct): red when some are
// due today, blue otherwise; past ones don't count.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const day = (o) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + o * 86400000));
const src = fetched.bids.slice(0, 6);
const cases = [
  { name: "2 today + 3 later + 1 past", bids: src.map((b, i) => ({ ...b, bidDue: i < 2 ? day(0) : i < 5 ? day(2) : day(-1), bidDueTime: "11:59 PM" })), count: "5", today: true },
  { name: "none today, 4 tomorrow", bids: src.slice(0, 4).map((b) => ({ ...b, bidDue: day(1), bidDueTime: "11:00 AM" })), count: "4", today: false },
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const c of cases) {
    const context = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: c.bids } }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    const badge = page.locator('[data-hpd-smoke="fc-bids-badge"]');
    await badge.waitFor({ timeout: 30000 });
    assert.equal((await badge.innerText()).trim(), c.count, `${c.name}: count`);
    assert.equal(await badge.evaluate((el) => el.classList.contains("is-bids-today")), c.today, `${c.name}: red only when due today`);
    await context.close();
  }
  console.log("PASS bids badge: the Bids button shows how many invitations are open (5 with 2 due today: red; 4 due tomorrow: blue; past ones not counted)");
} finally {
  await browser.close();
}
