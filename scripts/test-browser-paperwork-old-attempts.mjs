// 🗓 Old jobs, no access / refused (owner, 9 Nov: "for old affidavits we want to stay within the award, start and
// completion dates; that's when we have no access / refused; it could be afterwards because it's old"). EQ15239 was
// awarded 01/29/26: attempts months later are asked about, with HPD's window offered as the two attempt days (72 hours
// apart); "These dates are right" lets an old job closed out later go; an attempt before the award is stopped.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const JOB = "EQ15239";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/paperwork?job=${JOB}&outcome=no_access`, { waitUntil: "networkidle" });
  await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').waitFor();
  // Months after the award: asked, with HPD's window.
  await page.fill('[data-hpd-smoke="paperwork-attempt-1"]', "2026-10-01");
  await page.fill('[data-hpd-smoke="paperwork-attempt-2"]', "2026-10-05");
  const ask = page.locator('[data-hpd-smoke="paperwork-old-attempts"]');
  await ask.waitFor();
  assert.match(await ask.innerText(), /awarded 01\/29\/2026, but the last access attempt says 10\/05\/2026 \(\d+ months later\)/);
  await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
  await page.getByText(/Check the attempt dates first/).first().waitFor();
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-package-review"]').count(), 0, "not made before it's checked");
  const use = page.locator('[data-hpd-smoke="paperwork-old-attempts-use"]');
  if (await use.count()) {
    await use.click();
    const a1 = await page.locator('[data-hpd-smoke="paperwork-attempt-1"]').inputValue();
    const a2 = await page.locator('[data-hpd-smoke="paperwork-attempt-2"]').inputValue();
    assert.ok(a1 >= "2026-01-29" && (Date.parse(a2) - Date.parse(a1)) / 86400000 === 3, `HPD's window, 72 hours apart: ${a1} ${a2}`);
    assert.equal(await ask.count(), 0, "inside the window: no question");
  } else {
    // No HPD window on record: say they're right (an old job closed out later).
    await page.locator('[data-hpd-smoke="paperwork-old-attempts-ok-btn"]').click();
    await page.locator('[data-hpd-smoke="paperwork-old-attempts-ok"]').waitFor();
  }
  // Before the award: stopped, no "they're right" way around it.
  await page.fill('[data-hpd-smoke="paperwork-attempt-1"]', "2026-01-10");
  await page.fill('[data-hpd-smoke="paperwork-attempt-2"]', "2026-01-14");
  await ask.waitFor();
  assert.match(await ask.innerText(), /can't be before the award \(01\/29\/2026\)/);
  assert.equal(await page.locator('[data-hpd-smoke="paperwork-old-attempts-ok-btn"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS old-job attempts: months after the award asks (HPD's window offered, 72 hours apart), the package waits until checked, before the award is stopped");
} finally {
  await browser.close();
}
