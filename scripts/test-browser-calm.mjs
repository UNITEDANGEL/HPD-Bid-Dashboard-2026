// Calm map (owner, 21 Oct: "everything glowing at once is annoying, hard to concentrate; prioritize the overdue, not
// blinking"), at iPhone size on real data: with every notice job on the map, at most ONE pin moves (the most urgent,
// slowly), the rest have a steady ring; bid pins don't pulse; the Notices button doesn't pulse; a focus chip names the
// most urgent notice and opens it on the board.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
// Elements on the map with a running animation that never ends (spinners and the "you are here" dot don't count).
const moving = () => [...document.querySelectorAll(".leaflet-marker-pane *, .fc-map-controls *")].filter((el) => {
  const cs = getComputedStyle(el);
  return cs.animationName && cs.animationName !== "none" && cs.animationIterationCount === "infinite" && !el.classList.contains("hpd-spin") && !/spin/.test(cs.animationName) && !el.closest(".fc-user-location, .leaflet-user-marker");
}).map((el) => `${el.className}`.slice(0, 60));
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  // Every notice job on the map at once (the busiest view).
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const all = page.locator('[data-hpd-smoke="fc-notice-pick-all"]');
  if (await all.count()) await all.click();
  await page.waitForFunction(() => document.querySelectorAll(".fc-label-marker.is-glow").length > 3, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const glowing = await page.locator(".fc-label-marker.is-glow").count();
  const anim = await page.evaluate(moving);
  assert.ok(anim.length <= 1, `at most one thing moving on the map: ${anim.join(" | ")}`);
  assert.ok(await page.locator(".fc-label-marker.is-glow-top").count() <= 1, "one top pin");
  if (shots) await page.screenshot({ path: `${shots}/calm-notices.png` });
  // Back to the plain map: the focus chip (when a notice is overdue / under 6 h) opens it on the board.
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  const chip = page.locator('[data-hpd-smoke="fc-focus-chip"]');
  let chipText = "none (nothing overdue / under 6 h)";
  if (await chip.count()) {
    chipText = (await chip.innerText()).replace(/\s+/g, " ");
    assert.match(chipText, /⏰ [A-Z]{2}\d{5} (overdue \d+ h|\d+ h left)/);
    const omo = /([A-Z]{2}\d{5})/.exec(chipText)[1];
    if (shots) await page.screenshot({ path: `${shots}/calm-chip.png` });
    await chip.click();
    await page.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${omo}"]`).first().waitFor({ timeout: 20000 });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS calm map: ${glowing} notice jobs lit, ${anim.length} moving (${anim[0] || "none"}); bid pins and the Notices button steady; focus chip: ${chipText}`);
  await c.close();
} finally {
  await browser.close();
}
