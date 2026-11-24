// Dashboard on a small screen (owner, 23 Nov: "when it gets smaller, half of the words are not showing"):
// on a phone the Live Bids table becomes one labeled card per job, nothing hangs off the side, nothing ends in "...".
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const width of [340, 390, 760]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/overview/`, { waitUntil: "load", timeout: 180000 });
    await page.locator(".live-bids-table tbody tr").first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const vw = window.innerWidth;
      const cut = [];
      document.querySelectorAll(".dashboard-main *").forEach((el) => {
        if (el.children.length > 2) return;
        const t = (el.innerText || "").trim();
        if (!t || t.length > 80) return;
        const cs = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        if (!b.width || cs.visibility === "hidden") return;
        const clipped = (el.scrollWidth > el.clientWidth + 1 && (cs.overflow !== "visible" || cs.textOverflow === "ellipsis")) || b.right > vw + 1;
        if (clipped) cut.push(t.slice(0, 40));
      });
      const row = document.querySelector(".live-bids-table tbody tr");
      const labels = [...row.querySelectorAll("td")].map((td) => getComputedStyle(td, "::before").content.replace(/"/g, ""));
      return { vw, scrollW: document.documentElement.scrollWidth, cut, rowW: row.getBoundingClientRect().width, labels };
    });
    assert.ok(r.scrollW <= r.vw + 1, `${width}px: page is wider than the screen (${r.scrollW})`);
    assert.deepEqual(r.cut, [], `${width}px: words cut off`);
    assert.ok(r.rowW <= r.vw, `${width}px: job card fits`);
    assert.deepEqual(r.labels, ["OMO", "Address", "Borough", "Status", "COA Award", "Start", "Finish"], `${width}px: every field labeled`);
    assert.deepEqual(errors, []);
    console.log(`PASS dashboard ${width}px: job cards fit, every field labeled, no words cut off`);
    await context.close();
  }
} finally {
  await browser.close();
}
