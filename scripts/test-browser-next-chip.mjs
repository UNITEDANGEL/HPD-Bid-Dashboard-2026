// "Next" on the map (23 Oct, complete flow) at iPhone size: with no urgent notice, the pill at the bottom shows the next
// thing to do, most pressing first: bids due today not faxed -> tap opens the bids. With an urgent notice it stays the
// notice countdown (the notice comes first).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 2).map((b) => ({ ...b, bidDue: today, bidDueTime: "11:59 PM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function page({ notices }) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  // No HPD emails at all: no urgent notice on the board.
  await routePrivate(c, notices ? {} : { conversations: (d) => ({ ...d, threads: [] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  const p = await c.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await p.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await p.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await p.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  return { c, p, errors };
}
try {
  {
    const { c, p, errors } = await page({ notices: false });
    const chip = p.locator('[data-hpd-smoke="fc-next-chip"]');
    await chip.waitFor({ timeout: 30000 });
    assert.equal(await chip.getAttribute("data-kind"), "bids");
    assert.match((await chip.innerText()).replace(/\s+/g, " "), /Next: 2 bids due today · first 11:59 PM/);
    if (shots) await p.screenshot({ path: `${shots}/next-chip.png` });
    await chip.click();
    await p.locator('[data-hpd-smoke="fc-bids-banner"]').waitFor({ timeout: 15000 });
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    const { c, p, errors } = await page({ notices: true });
    await p.locator('[data-hpd-smoke="fc-focus-chip"]').waitFor({ timeout: 30000 });
    assert.equal(await p.locator('[data-hpd-smoke="fc-next-chip"]').count(), 0, "an urgent notice comes first");
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS next chip: no urgent notice -> 'Next: 2 bids due today · first 11:59 PM' opens the bids; with an urgent notice the notice countdown shows instead");
} finally {
  await browser.close();
}
