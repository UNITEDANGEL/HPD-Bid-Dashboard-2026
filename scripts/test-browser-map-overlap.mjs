// "Overlapping fix" (owner, 22 Nov): on the iPhone map the pin words ("2nd try", "12d") ran under the next pin and
// over each other, and the ⏱ <6h tag covered the Notices count. Checks: no two pin chips cross, no chip covers another
// pin, and the ⏱ tag doesn't touch the Notices count, at the start zoom and one step out.
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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').waitFor({ timeout: 60000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  await page.locator(".fc-pin").first().waitFor({ timeout: 60000 });
  const overlaps = () => page.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
    const pins = [...document.querySelectorAll(".fc-pin")].filter((p) => box(p).width > 0);
    const chips = pins.map((p) => [p, p.querySelector(".fc-pin-chip")]).filter(([, c]) => c);
    const bad = [];
    for (const [p, c] of chips) {
      for (const [q, d] of chips) if (p !== q && hit(box(c), box(d))) bad.push(`chip "${c.textContent}" on chip "${d.textContent}"`);
      for (const q of pins) { const head = q.querySelector(".fc-pin-head"); if (q !== p && head && hit(box(c), box(head))) bad.push(`chip "${c.textContent}" on a pin`); }
    }
    const tag = document.querySelector(".fc-dock-btn.fc-notices-fab .fc-urgent-tag");
    const count = document.querySelector(".fc-dock-btn.fc-notices-fab .fc-follow-badge");
    if (tag && count && hit(box(tag), box(count))) bad.push("⏱ tag on the Notices count");
    return { bad, chips: chips.length, pins: pins.length, tag: Boolean(tag && count) };
  });
  const first = await overlaps();
  assert.ok(first.pins > 0, "pins on the map");
  assert.deepEqual(first.bad, [], `start zoom: ${first.bad.join("; ")}`);
  await page.evaluate(() => document.querySelector(".leaflet-control-zoom-out, [aria-label='Zoom out']")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForTimeout(1500);
  const out = await overlaps();
  assert.deepEqual(out.bad, [], `zoomed out: ${out.bad.join("; ")}`);
  assert.deepEqual(errors, []);
  console.log(`PASS: map overlap (${first.pins} pins, ${first.chips} with words, zoomed out ${out.chips}; ⏱ tag checked: ${first.tag})`);
} finally {
  await browser.close();
}
