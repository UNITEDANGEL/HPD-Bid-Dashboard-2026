// What breaks on the phone goes to Claude (2 Nov): a script error and a failed promise on the map are kept on the phone
// and sent once to the status server as APP-ERRORS-<phone> (the same error counted, not repeated), with emails and
// phone numbers taken out; browser noise (ResizeObserver, aborted loads) is left out. Status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const posted = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { posted.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await c.addInitScript(() => { window.__hpdReportInTests = true; });
  const page = await c.newPage();
  page.on("pageerror", () => {});
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error("Test boom: call 212-555-1234 or owner@example.com about ER08092"); }, 10 * i);
    setTimeout(() => { Promise.reject(new TypeError("Cannot read properties of undefined (reading 'omo')")); }, 50);
    setTimeout(() => { throw new Error("ResizeObserver loop completed with undelivered notifications."); }, 60);
  });
  const sent = () => posted.filter((b) => String(b?.key || "").startsWith("APP-ERRORS-"));
  for (let i = 0; i < 40 && !sent().length; i++) await page.waitForTimeout(250);
  assert.equal(sent().length, 1, "sent once");
  const { key, patch } = sent()[0];
  assert.match(key, /^APP-ERRORS-[a-z0-9]{4,}$/);
  assert.equal(patch.errors.length, 2, JSON.stringify(patch.errors));
  const boom = patch.errors.find((e) => /Test boom/.test(e.msg));
  assert.equal(boom.msg, "Error: Test boom: call <number> or <email> about ER08092");
  assert.equal(boom.n, 3);
  assert.equal(boom.kind, "error");
  assert.equal(boom.page, "/map/");
  const prom = patch.errors.find((e) => e.kind === "promise");
  assert.match(prom.msg, /^TypeError: Cannot read properties of undefined \(reading 'omo'\)$/);
  assert.ok(!JSON.stringify(patch).includes("555-1234") && !JSON.stringify(patch).includes("example.com"));
  assert.match(patch.device, /Chrome|Android|other/);
  // A second error within 2 minutes waits (not sent right away).
  await page.evaluate(() => setTimeout(() => { throw new Error("Second one"); }, 0));
  await page.waitForTimeout(5000);
  assert.equal(sent().length, 1, "at most every 2 minutes");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-app-errors") || "[]").length), 3, "kept on the phone for the next send");
  console.log(`PASS app errors: 3× the same script error + a failed promise sent once as ${key} (number and email taken out, noise left out); the next waits 2 minutes`);
  await c.close();
} finally {
  await browser.close();
}
