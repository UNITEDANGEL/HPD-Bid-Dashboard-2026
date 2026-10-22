// Every map button and its label can be seen and tapped on real iPhone screens, upright with Safari's toolbars
// (390x664, 375x553 small iPhone), plain upright (390x844) and sideways (844x340): nothing under "Today's
// route", the map scale or off the bottom of the screen.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const seen = [];
try {
  for (const [w, h] of [[390, 664], [375, 553], [390, 844], [844, 340]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    const page = await context.newPage();
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
    // An alert banner on screen must not cover any map button (21 Oct: a ⏰ banner covered Route).
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "message", title: "⏰ EQ00000: notice overdue 2 h — answer now", text: "test banner" } })));
    await page.locator('[data-hpd-smoke="fc-hpd-ping"]').waitFor();
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll(".fc-map-controls .fc-map-fab")].filter((x) => x.offsetParent);
      const hidden = buttons.map((x) => {
        const parts = [x.querySelector("svg"), x.querySelector(".fc-fab-label")].filter(Boolean);
        const bad = parts.some((el) => { const b = el.getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.bottom > innerHeight || b.right > innerWidth || !e || !x.contains(e); });
        return bad ? x.getAttribute("aria-label") : "";
      }).filter(Boolean);
      return { count: buttons.length, hidden };
    });
    assert.ok(r.count >= 8, `${w}x${h}: map buttons shown`);
    assert.deepEqual(r.hidden, [], `${w}x${h}: hidden buttons`);
    seen.push(`${w}x${h}: ${r.count}`);
    await context.close();
  }
  console.log(`PASS buttons visible: every map button and label can be seen and tapped (${seen.join(", ")})`);
} finally {
  await browser.close();
}
