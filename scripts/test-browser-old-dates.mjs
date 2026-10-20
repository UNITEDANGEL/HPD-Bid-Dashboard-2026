// Old-job date check (owner, 20 Oct, after EP27382: awarded 5/21/2025, the paperwork went out with 2026 dates and vendor
// tracking asked to confirm the date): making paperwork for a job awarded long ago with a work date months later stops
// and asks -- "Use HPD's dates" fills HPD's start / complete-by dates, "These dates are right" lets those dates through;
// nothing is made until one of them. A recent job never asks. iPhone size; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const OLD = "EQ15489"; // awarded 1/5/2026, HPD dates 1/5 - 1/15 (EP27382 itself was made outside the app, which only knows 2026 jobs)
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/api\/drive\//, (r) => r.fulfill({ status: 401, json: { connected: false } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/paperwork/?job=${OLD}&outcome=work_completed`, { waitUntil: "load", timeout: 180000 });
  const complete = page.locator('[data-hpd-smoke="paperwork-work-complete"]');
  await complete.waitFor();
  // Today's date on a job awarded 17 months ago (what happened on 20 Oct).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  await page.locator('[data-hpd-smoke="paperwork-work-start"]').fill(today);
  await complete.fill(today);
  const warn = page.locator('[data-hpd-smoke="paperwork-old-dates"]');
  await warn.waitFor();
  assert.match(await warn.innerText(), /This job was awarded 01\/05\/2026, but the work date says \d\d\/\d\d\/20\d\d \(\d+ months later\)/);
  await warn.scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/old-dates-1.png` });
  // Nothing is made while it asks.
  await page.locator('[data-hpd-smoke="paperwork-generate-print"]').click();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-package-review"]').count(), 0, "not made yet");
  assert.match(await page.locator("main").innerText(), /Check the work dates first/);
  // HPD's dates, when the job has them; otherwise a real past date typed in.
  const use = warn.locator('[data-hpd-smoke="paperwork-old-dates-use"]');
  let fixedWith = "";
  if (await use.count()) {
    fixedWith = (await use.innerText()).replace(/^Use HPD's dates: /, "");
    await use.click();
  } else {
    await page.locator('[data-hpd-smoke="paperwork-work-start"]').fill("2025-01-24");
    await complete.fill("2025-01-24");
    fixedWith = "01/24/2025 typed";
  }
  await page.waitForTimeout(300);
  assert.equal(await warn.count(), 0, "the warning goes away with real dates");
  // Back to a late date -> "These dates are right" lets exactly those dates through.
  await complete.fill(today);
  await page.locator('[data-hpd-smoke="paperwork-work-start"]').fill(today);
  await warn.waitFor();
  await warn.locator('[data-hpd-smoke="paperwork-old-dates-ok-btn"]').click();
  await page.locator('[data-hpd-smoke="paperwork-old-dates-ok"]').waitFor();
  await page.locator('[data-hpd-smoke="paperwork-generate-print"]').click();
  await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
  assert.deepEqual(errors, []);
  console.log(`PASS old-job dates: ${OLD} (awarded 01/05/2026) with today's date -> "Check the dates", nothing made; fixed with ${fixedWith} -> warning gone; "These dates are right" -> made with those dates`);
  await context.close();
} finally {
  await browser.close();
}
