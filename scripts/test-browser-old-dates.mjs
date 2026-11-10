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
  // ✨ Fixed by itself (owner, 10 Nov: "auto fix all dates"): HPD's own dates when the job has them, else the old job's
  // dates are kept; a note says which, with Undo. No question in the way.
  const note = page.locator('[data-hpd-smoke="paperwork-auto-dates"]');
  await note.waitFor({ timeout: 15000 });
  const said = await note.innerText();
  assert.match(said, /^✨ Dates fixed: (Work dates set to HPD's: \d\d\/\d\d\/\d{4} – \d\d\/\d\d\/\d{4} \(yours said .+ months? after the award\)\.|Old job: work dates kept as .+)/);
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-old-dates"]').count(), 0, "no question");
  const fixedWith = said.includes("HPD's:") ? said.replace(/^.*HPD's: ([^ ]+ – [^ ]+).*$/s, "$1") : "kept (no HPD dates)";
  if (said.includes("HPD's:")) {
    assert.notEqual(await complete.inputValue(), today, "HPD's complete date filled in");
    // Undo: your own dates back, and they're let through as they are.
    await note.locator('[data-hpd-smoke="paperwork-auto-dates-undo"]').click();
    await page.locator('[data-hpd-smoke="paperwork-old-dates-ok"]').waitFor();
    assert.equal(await complete.inputValue(), today, "yours back");
    await page.waitForTimeout(500);
    assert.equal(await complete.inputValue(), today, "not changed again");
  }
  await page.locator('[data-hpd-smoke="paperwork-generate-print"]').click();
  await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
  assert.deepEqual(errors, []);
  console.log(`PASS old-job dates: ${OLD} (awarded 01/05/2026) with today's date -> fixed by itself (${fixedWith}), Undo keeps yours, the package is made`);
  await context.close();
} finally {
  await browser.close();
}
