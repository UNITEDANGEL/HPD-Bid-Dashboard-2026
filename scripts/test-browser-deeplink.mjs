// An alert opens its own job (owner, 21 Oct "next upgrade"), at iPhone size: a phone alert's link to the board scrolls to
// that job's card and highlights it; a new-invitation link opens that bid; a rejection link with its job opens the job
// card; tapping an item in 🔔 Notifications does the same. Real data; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.slice(0, 6).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  return c;
};
try {
  const errors = [];
  // 1. Board link with a job: that card, scrolled to and highlighted.
  {
    const c = await ctx();
    const page = await c.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    // Which jobs are on the board (the last one, so it has to scroll).
    await page.goto(`${baseUrl}/map/?view=all&map=1&board=1`, { waitUntil: "load", timeout: 180000 });
    const rows = page.locator('[data-hpd-smoke="fc-board-row"]');
    await rows.first().waitFor({ timeout: 60000 });
    const omos = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
    const target = omos[omos.length - 1];
    await page.goto(`${baseUrl}/map/?view=all&map=1&board=1&omo=${target}`, { waitUntil: "load" });
    const row = page.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${target}"]`).first();
    await row.waitFor({ timeout: 60000 });
    await page.waitForFunction((o) => document.querySelector(`[data-hpd-smoke="fc-board-row"][data-omo="${o}"]`)?.classList.contains("is-focus"), target, { timeout: 10000 });
    await page.waitForTimeout(900);
    const box = await row.boundingBox();
    assert.ok(box && box.y < 844 && box.y + 40 > 0, `${target} scrolled into view (y ${box?.y})`);
    if (shots) await page.screenshot({ path: `${shots}/deeplink-board.png` });
    await c.close();
    console.log(`  board link -> ${target} highlighted (last of ${omos.length})`);
  }
  // 2. New-invitation link: that bid opens.
  {
    const c = await ctx();
    const page = await c.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const omo = bids[3].omo;
    await page.goto(`${baseUrl}/map/?bids=1&omo=${omo}`, { waitUntil: "load", timeout: 180000 });
    const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
    await sheet.waitFor({ timeout: 60000 });
    assert.equal((await sheet.locator("header strong").innerText()).trim(), omo);
    await c.close();
    console.log(`  invitation link -> bid ${omo} open`);
  }
  // 3. 🔔 Notifications: tapping a rejection opens its job card; a bid opens the bid.
  {
    const c = await ctx();
    const jobs = (await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json());
    const list = Array.isArray(jobs) ? jobs : Object.values(jobs).find(Array.isArray);
    const jobOmo = String(list.find((j) => j.OMO && j.Latitude)?.OMO || list[0].OMO);
    const bidOmo = bids[2].omo;
    await c.addInitScript(({ jobOmo, bidOmo }) => {
      const m = (min) => new Date(Date.now() - min * 60000).toISOString();
      localStorage.setItem("hpd-notifications-v1", JSON.stringify([
        { id: "r1", at: m(2), kind: "rejection", title: `💵 Payment rejected · ${jobOmo}`, text: "test", go: "money", omo: jobOmo },
        { id: "b1", at: m(5), kind: "bid", title: `🧾 New invitation to bid · ${bidOmo}`, text: "test", go: "bids", omo: bidOmo },
      ]));
    }, { jobOmo, bidOmo });
    const page = await c.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
    await page.locator('[data-hpd-smoke="fc-notif-open"]').click();
    await page.locator('[data-hpd-smoke="fc-notif-row"]', { hasText: jobOmo }).locator(".fc-notif-main").click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(jobOmo));
    if (shots) await page.screenshot({ path: `${shots}/deeplink-job.png` });
    await page.locator(".fc-job-sheet-close").click();
    await page.locator('[data-hpd-smoke="fc-notif-open"]').click();
    await page.locator('[data-hpd-smoke="fc-notif-row"]', { hasText: bidOmo }).locator(".fc-notif-main").click();
    const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
    await sheet.waitFor({ timeout: 60000 });
    assert.equal((await sheet.locator("header strong").innerText()).trim(), bidOmo);
    await c.close();
    console.log(`  🔔 rejection -> job card ${jobOmo}; 🔔 invitation -> bid ${bidOmo}`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS alerts open their job: board link scrolls to and highlights the job, invitation link opens the bid, 🔔 items open the job card / the bid");
} finally {
  await browser.close();
}
