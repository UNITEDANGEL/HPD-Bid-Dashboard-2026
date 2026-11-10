// 🗓 Wrong line 2 date on sent affidavits (owner, 9 Nov: "big error in all affidavits, see ER04312 ... line 2 date
// needs to be the confirmation of award date; change all Aff Invoice we generated and going forward, especially in
// the app"). The notices board lists every sent affidavit whose line 2 had another date (read from your sent PDFs),
// the job card says it too, and "🛠 Fix it now" opens the correction with HPD's reason and line 2 = the award date.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const OMO = "EQ15239"; // awarded 01/29/26: the earlier HPD form, line 2 has a date
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/correction_dates\.json/, (r) => r.fulfill({ json: { generatedAt: "2026-11-09T00:00:00Z", jobs: {
    [OMO]: { awardDate: "2026-02-12", workStart: "2026-02-12", workComplete: "2026-02-12", outcome: "work_completed", sentAt: "2026-10-20" },
    ER04312: { awardDate: "2026-09-12", workStart: "2026-09-12", workComplete: "2026-09-12", outcome: "work_completed", sentAt: "2026-10-19" },
  } } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});

  // The board: both listed, newest sent first, with the dates.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor({ timeout: 5000 }).catch(() => {}); if (!(await page.locator('[data-hpd-smoke="fc-board"]').count())) await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click(); // Notices opens the board itself (10 Nov)
  const box = page.locator('[data-hpd-smoke="fc-line2"]');
  await box.waitFor({ timeout: 20000 });
  assert.match(await box.locator("summary").innerText(), /🗓 2 affidavits sent with the wrong date on line 2/);
  const rows = box.locator('[data-hpd-smoke="fc-line2-row"]');
  assert.deepEqual(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-omo"))), [OMO, "ER04312"]);
  assert.match(await rows.nth(1).innerText(), /ER04312\s*says 09\/12\/26 \(work date\) → 09\/04\/26 award/);
  await page.locator('[data-hpd-smoke="fc-board-close"]').click();

  // The job card says it too.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(OMO).catch(() => {});
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${OMO}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  const banner = page.locator('[data-hpd-smoke="jc-line2"]');
  assert.match(await banner.innerText(), /wrong date on line 2[\s\S]*says 02\/12\/26 \(the work date\)[\s\S]*Confirmation of Award date: 01\/29\/26/);
  const href = await banner.locator('[data-hpd-smoke="jc-line2-fix"]').getAttribute("href");
  assert.match(href, new RegExp(`^/paperwork/\\?job=${OMO}&fix=\\d{4}-\\d{2}-\\d{2}&reason=Line%202%20date.*&auto=1$`));

  // Auto-fix it now: the correction runs by itself from HPD's reason; line 2 = the award date.
  await banner.locator('[data-hpd-smoke="jc-line2-fix"]').click();
  await page.waitForURL(/\/paperwork\//);
  const corr = page.locator('[data-hpd-smoke="paperwork-correction"]');
  await corr.waitFor({ timeout: 60000 });
  assert.match(await corr.innerText(), /HPD: Line 2 date \(directed by HPD on\) must be the Confirmation of Award date 01\/29\/26, not 02\/12\/26 \(the work date\)\./);
  const note = page.locator('[data-hpd-smoke="paperwork-line2"]');
  await note.waitFor({ timeout: 30000 });
  assert.match(await note.innerText(), /Line 2 \("That on ___ I was directed by HPD"\) = 01\/29\/26, the Confirmation of Award date\. The one you sent said 02\/12\/26: this fixes it\./);
  const fixed = page.locator('[data-hpd-smoke="paperwork-autofixed"], [data-hpd-smoke="paperwork-autofixed-review"]').first();
  await fixed.waitFor({ timeout: 90000 });
  assert.match(await fixed.innerText(), /Line 2 \("That on ___ I was directed by HPD"\): prints the Confirmation of Award date, 01\/29\/2026, not the work date\./);
  assert.deepEqual(errors, []);
  console.log("PASS line 2: the board lists the affidavits sent with the wrong line 2 date (work date → award date), the job card says it, Fix it now opens the correction with line 2 = 01/29/26");
} finally {
  await browser.close();
}
