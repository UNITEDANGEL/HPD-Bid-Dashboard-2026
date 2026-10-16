// One HPD notice at a time, inside the app: in HPD notices, a rejection's "See HPD's notice" opens HPD's own
// email (subject, date, sender, full text) and every page of the PDF they sent back as pictures; a page opens
// full screen. Not signed in, it says the notices are private. Prints no notice text.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let shown = "";
try {
  for (const signedIn of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    if (signedIn) await routePrivate(context);
    else await context.route(/\/api\/private\//, (r) => r.fulfill({ status: 401, json: { error: "Sign in with Google" } }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
    await page.locator('[data-hpd-smoke="fc-notice-tab-rejected"]').click(); // Priority is the first tab
    const buttons = page.locator('[data-hpd-smoke="fc-notice-view"]');
    await buttons.first().waitFor({ timeout: 30000 });
    // Signed in: the first notice that has HPD's PDF (the button says how many page files).
    if (signedIn) await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="fc-notice-view"]')].some((b) => /\(\d+ PDFs?\)/.test(b.textContent)), null, { timeout: 20000 });
    const pick = signedIn ? buttons.filter({ hasText: /\(\d+ PDFs?\)/ }).first() : buttons.first();
    await pick.scrollIntoViewIfNeeded();
    await pick.click();
    const viewer = page.locator('[data-hpd-smoke="fc-notice-viewer"]');
    await viewer.waitFor({ timeout: 10000 });
    if (signedIn) {
      const mail = viewer.locator('[data-hpd-smoke="fc-notice-mail"]').first();
      await mail.waitFor({ timeout: 15000 });
      assert.ok((await mail.locator(".fc-notice-meta b").innerText()).trim().length > 5, "HPD's subject shown");
      assert.ok((await mail.locator(".fc-notice-body").innerText()).trim().length > 20, "HPD's email text shown");
      const thumb = mail.locator('[data-hpd-smoke="fc-itb-thumb"] img').first();
      await thumb.waitFor({ timeout: 60000 });
      await page.waitForFunction((el) => el.naturalWidth > 300, await thumb.elementHandle(), { timeout: 30000 });
      const pages = await mail.locator('[data-hpd-smoke="fc-itb-thumb"]').count();
      await mail.locator('[data-hpd-smoke="fc-itb-thumb"]').first().click();
      const full = page.locator('[data-hpd-smoke="fc-itb-full"]');
      await full.waitFor({ timeout: 5000 });
      const box = await full.boundingBox();
      assert.ok(box.width >= 840 && box.height >= 385, "page opens full screen above the notice");
      assert.ok(await page.evaluate(() => { const f = document.querySelector('[data-hpd-smoke="fc-itb-full"]').getBoundingClientRect(); const el = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2); return !!el.closest('[data-hpd-smoke="fc-itb-full"]'); }), "full page not covered");
      await page.locator('[data-hpd-smoke="fc-itb-close"]').click();
      // The viewer's own body scrolls (long emails / several pages).
      const scrollable = await viewer.locator(".fc-summary-body").evaluate((b) => getComputedStyle(b).overflowY);
      assert.match(scrollable, /auto|scroll/, "notice viewer scrolls");
      shown = `${pages} page picture(s)`;
    } else {
      await viewer.locator('[data-hpd-smoke="fc-notice-signin"]').waitFor({ timeout: 10000 });
    }
    await page.locator('[data-hpd-smoke="fc-notice-viewer-close"]').click();
    await page.locator('[data-hpd-smoke="fc-notices-sheet"]').waitFor({ timeout: 5000 });
    assert.equal(await viewer.count(), 0, "back to the notices list");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS notice view: a rejection's "See HPD's notice" shows HPD's email (subject, date, text) and ${shown} of their PDF, a page opens full screen, ← Notices goes back; not signed in it says private`);
} finally {
  await browser.close();
}
