// The free Google pictures counter on the job card (owner, 2 Nov), at iPhone size: it says how many of this month's
// 9,000 free pictures are used (all devices); at 9,000 it stops showing pictures and says why, with the 360° view still
// there. The status server is faked (the test browser never loads a real Google picture).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "EQ15239";
const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const open = async (used) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: { [`SV-COUNT-${month}-computer`]: { n: used } }, accepted: [] } }));
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
    const count = page.locator('[data-hpd-smoke="jc-hero-count"]');
    await count.waitFor({ timeout: 20000 });
    return { c, page, errors, count };
  };
  const a = await open(1234);
  assert.equal((await a.count.innerText()).trim(), "Free pictures this month: 1,234 of 9,000");
  assert.ok(!(await a.count.getAttribute("class")).includes("is-out"));
  assert.deepEqual(a.errors, []);
  await a.c.close();
  const b = await open(9000);
  assert.equal((await b.count.innerText()).trim(), "Free pictures this month: 9,000 of 9,000");
  assert.ok((await b.count.getAttribute("class")).includes("is-out"));
  assert.match(await b.page.locator('[data-hpd-smoke="jc-hero-empty"]').innerText(), /free Google pictures are used up: back on the 1st\. The 360° view still works/);
  assert.equal(await b.page.locator('[data-hpd-smoke="jc-hero-360"]').count(), 1, "360° view still there");
  assert.equal(await b.page.locator(".jc-hero-photo img").count(), 0, "no picture loaded");
  assert.deepEqual(b.errors, []);
  await b.c.close();
  console.log("PASS free pictures counter: job card shows 1,234 of 9,000; at 9,000 no picture, 'used up: back on the 1st', 360° view still there");
} finally {
  await browser.close();
}
