// Fix payment rejections one by one (owner, 19 Oct): 💰 To get paid -> "🔧 Fix them one by one" opens the first rejection
// with Auto-fix and the preview; Accept -> "Next: <OMO> →" opens the next one; Skip works before accepting. Nothing is
// sent; status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-pick-list"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-tab-money"]').click();
  const start = page.locator('[data-hpd-smoke="fc-fix-all"]');
  await start.waitFor({ timeout: 20000 });
  const label = await start.innerText();
  const n = Number((/\((\d+)\)/.exec(label) || [])[1]);
  assert.ok(n >= 2, `rejections to fix: ${label}`);
  await start.click();
  await page.waitForURL(/\/paperwork\/.*auto=1/, { timeout: 30000 });
  // Jobs that need your dates first (2024-25) can be skipped right away; go to one Auto-fix can finish by itself.
  const review = page.locator('[data-hpd-smoke="paperwork-correction-review"]');
  for (let i = 0; i < n; i++) {
    const ok = await review.waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    if (ok) break;
    const prog = page.locator('[data-hpd-smoke="paperwork-fix-progress"]');
    assert.match(await prog.innerText(), new RegExp(`Fixing one by one · ${i + 1} of ${n}`));
    const before = page.url();
    await prog.locator('[data-hpd-smoke="paperwork-fix-skip-early"]').click();
    await page.waitForURL((u) => u.toString() !== before, { timeout: 30000 });
  }
  const first = new URL(page.url()).searchParams.get("job");
  const at = Number((/Fixing one by one · (\d+) of/.exec(await page.locator("main").innerText()) || [])[1]);
  // Before accepting: "Fixing one by one · 1 of N" and Skip.
  const box = page.locator('[data-hpd-smoke="paperwork-fix-next"]');
  assert.match(await box.innerText(), new RegExp(`Fixing one by one · ${at} of ${n}`));
  assert.equal(await box.locator('[data-hpd-smoke="paperwork-fix-skip"]').count(), 1);
  // Accept -> Next.
  await page.locator('[data-hpd-smoke="paperwork-correction-save"]').click();
  await page.locator('[data-hpd-smoke="paperwork-correction-saved"]').waitFor({ timeout: 15000 });
  const next = box.locator('[data-hpd-smoke="paperwork-fix-next-go"]');
  const nextText = await next.innerText();
  assert.match(nextText, /^Next: [A-Z]{2}\d{5} →$/);
  if (shots) await page.screenshot({ path: `${shots}/fixq-1.png` });
  await next.click();
  await page.waitForURL((u) => new URL(u).searchParams.get("job") !== first, { timeout: 30000 });
  const second = new URL(page.url()).searchParams.get("job");
  assert.equal(nextText.replace(/^Next: | →$/g, ""), second);
  await page.waitForTimeout(3000);
  assert.match(await page.locator("main").innerText(), new RegExp(`${at + 1} of ${n}`));
  assert.deepEqual(errors, []);
  console.log(`PASS fix queue: ${n} rejections to fix (${label.split("·")[1]?.trim()}); ${first} auto-fixed + accepted, Next opened ${second} (${at + 1} of ${n}); jobs needing your dates first were skipped`);
  await context.close();
} finally {
  await browser.close();
}
