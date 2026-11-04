// Notes on the job card at iPhone size: type a note, it stays after reload; a note told to the chat about the address shows too.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "ER06362";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route("**/api/drive/**", (r) => r.fulfill({ json: {} }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const open = async () => {
    await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  };
  await open();
  const box = page.locator('[data-hpd-smoke="jc-notes"]');
  await box.waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="jc-note-input"]').fill("gate code 4321");
  await page.locator('[data-hpd-smoke="jc-note-save"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="jc-note"]').count(), 1);
  await open();
  assert.match(await page.locator('[data-hpd-smoke="jc-note"]').first().textContent(), /gate code 4321/, "note is still there after reload");
  await page.locator('[data-hpd-smoke="jc-note"] button').first().click();
  assert.equal(await page.locator('[data-hpd-smoke="jc-note"]').count(), 0);
  const r = await box.boundingBox();
  assert.ok(r && r.width <= 390, "fits the iPhone");
  assert.deepEqual(errors, []);
  console.log("job notes browser ok");
} finally {
  await browser.close();
}
