// Right after a deploy an app file can be missing for a moment: the map used to sit on "Loading jobs..."
// until reloaded by hand. Now it reloads by itself (at most twice in 5 minutes) and loads the jobs.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  // 1. One app file is missing on the first load only.
  let missing = "";
  await context.route(/\/_next\/static\/chunks\/[^/]+\.js$/, (r) => {
    if (!missing) { missing = r.request().url(); return r.fulfill({ status: 404, contentType: "text/html", body: "<!doctype html>not found" }); }
    return r.continue();
  });
  const page = await context.newPage();
  let loads = 0;
  page.on("load", () => loads++);
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  assert.ok(missing, "a file was held back");
  assert.equal(loads, 2, "reloaded once by itself");
  // 2. A file that stays missing: reloads twice, then stops (no endless reloading).
  const page2 = await context.newPage();
  await context.unroute(/\/_next\/static\/chunks\/[^/]+\.js$/);
  await page2.route(/\/_next\/static\/chunks\/[^/]+\.js$/, (r) => (r.request().url() === missing ? r.fulfill({ status: 404, body: "" }) : r.continue()));
  let loads2 = 0;
  page2.on("load", () => loads2++);
  await page2.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page2.waitForTimeout(20000);
  assert.equal(loads2, 3, `first load + 2 automatic reloads, then stop (got ${loads2})`);
  console.log(`PASS update recovery: missing app file -> reloaded once by itself and the map loaded; a file that stays missing -> 2 reloads then stops`);
} finally {
  await browser.close();
}
