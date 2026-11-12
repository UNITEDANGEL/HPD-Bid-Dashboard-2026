// Opening speed (owner idea, 3 Nov): the extra lists (paid, older jobs, notice status) wait until the pins are up,
// but still arrive: the page asks for the jobs first and the others after.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  const asked = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { const m = r.url().match(/\/data\/(COA_Fetcher_2026|COA_older|pip_paid|hpd_job_status|sent_paperwork|hpd_requests)\.json/); if (m) asked.push(m[1]); });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-bids-open"]').length > 0, null, { timeout: 60000 });
  // Up to 20 s for the rest to be asked for (a fixed 3.5 s missed COA_older on the busy build machine, 11 Nov).
  const all = ["COA_Fetcher_2026", "COA_older", "pip_paid", "hpd_job_status", "sent_paperwork", "hpd_requests"];
  for (let i = 0; i < 80 && !all.every((n) => asked.includes(n)); i++) await page.waitForTimeout(250);
  for (const name of ["COA_Fetcher_2026", "COA_older", "pip_paid", "hpd_job_status", "sent_paperwork", "hpd_requests"]) assert.ok(asked.includes(name), `${name} still loads: ${asked}`);
  assert.equal(asked[0], "COA_Fetcher_2026", `the jobs are asked for first: ${asked}`);
  assert.deepEqual(errors, []);
  console.log(`PASS open fast: jobs asked first, then ${asked.slice(1).join(", ")}`);
  await context.close();
} finally {
  await browser.close();
}
