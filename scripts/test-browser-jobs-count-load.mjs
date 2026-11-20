// The Jobs number shows only the real count (19 Nov, found live: right after opening it read 533, then 442, then the
// real 105, because every job counted as "to do" until HPD's closed jobs, the paperwork sent and PIP's payments had
// loaded). Those three files are held back 3 s here: the badge stays empty until they are in, then shows one number.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let held = 0;
  await context.route(/\/data\/(hpd_job_status|sent_paperwork|pip_paid)\.json/, async (r) => { held += 1; await new Promise((ok) => setTimeout(ok, 3000)); await r.continue(); });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__jobCounts = [];
    const read = () => { const t = document.querySelector('[data-hpd-smoke="fc-jobs-count"]')?.textContent?.replace(/\D/g, ""); if (t) window.__jobCounts.push(Number(t)); };
    setInterval(read, 100);
  });
  await page.goto(`${baseUrl}/map/`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').waitFor();
  // Every job is on the map well before the held files come in; the number must not show yet.
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-hpd-smoke="fc-jobs-count"]').count(), 0, "no Jobs number before the closed / sent / paid data");
  await page.locator('[data-hpd-smoke="fc-jobs-count"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500); // the count-up animation settles
  const final = Number((await page.locator('[data-hpd-smoke="fc-jobs-count"]').innerText()).replace(/\D/g, ""));
  const seen = await page.evaluate(() => window.__jobCounts);
  const max = Math.max(...seen);
  assert.ok(held >= 3, "the three files were held back");
  assert.ok(final > 0, "a Jobs number shows");
  assert.ok(max <= final, `never a bigger number than the real one (saw up to ${max}, real ${final})`);
  assert.deepEqual(errors, []);
  console.log(`PASS Jobs number: empty while the closed / sent / paid data load, then ${final} (never higher)`);
} finally {
  await browser.close();
}
