// Bottom buttons you pick (28 Oct): hold a bottom button about half a second -> "Bottom buttons" opens with that slot
// lit (and the tap doesn't open its screen); picking Follow-up for it swaps them, the old one moves to the strip and
// still works there; it stays after a reload; More -> Bottom buttons opens it too, and Back to Jobs · Bids · Notices
// resets. Also: the bottom has no black bar any more (owner: "it should be transparent").
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const load = async () => {
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('[data-hpd-smoke="fc-dock"]').waitFor({ timeout: 20000 });
  };
  const dockLabels = async () => (await page.locator('[data-hpd-smoke="fc-dock"] .fc-fab-label').allInnerTexts()).map((t) => t.trim());
  const stripLabels = async () => (await page.locator('[data-hpd-smoke="fc-dock-strip"] .fc-dock-chip .fc-fab-label').allInnerTexts()).map((t) => t.trim());
  await load();

  // No black bar: the dock itself is see-through.
  const bg = await page.locator('[data-hpd-smoke="fc-dock"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.match(bg, /rgba\(0, 0, 0, 0\)|transparent/, `dock background see-through: ${bg}`);
  assert.deepEqual(await dockLabels(), ["Jobs", "Bids", "AI", "Notices", "More"]);

  // Hold Bids: the picker opens on its slot, the bids list does not open.
  const bids = page.locator('[data-hpd-smoke="fc-dock"] [data-hpd-smoke="fc-bids-open"]');
  const edit = page.locator('[data-hpd-smoke="fc-dock-edit"]');
  // (Once more if the map was still settling and moved things under the finger.)
  for (let i = 0; i < 2 && !(await edit.count()); i++) {
    await page.waitForTimeout(500);
    const b = await bids.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForTimeout(300);
    if (!(await edit.count()) && await page.locator('[data-hpd-smoke="fc-bids-list"]').count()) await bids.click();
  }
  await edit.waitFor({ timeout: 5000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-dock-slot-1"]').getAttribute("class"), /is-on/, "the held slot is lit");
  assert.equal(await page.locator('[data-hpd-smoke="fc-bids-list"]').count(), 0, "holding doesn't open Bids");
  await page.locator('[data-hpd-smoke="fc-dock-pick-1-follow"]').click();
  await page.locator('[data-hpd-smoke="fc-dock-done"]').click();
  await edit.waitFor({ state: "detached" });
  assert.deepEqual(await dockLabels(), ["Jobs", "Follow-up", "AI", "Notices", "More"]);
  assert.ok((await stripLabels()).includes("Bids") && !(await stripLabels()).includes("Follow-up"), `Bids moved to the strip: ${await stripLabels()}`);
  // Bids still works from the strip; Follow-up works from the dock.
  await page.locator('[data-hpd-smoke="fc-dock-strip"] [data-hpd-smoke="fc-bids-open"]').click();
  await page.locator('[data-hpd-smoke="fc-bids-list"]').waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-dock"] [data-hpd-smoke="fc-follow-open"]').click();
  await page.locator('[data-hpd-smoke="fc-follow-sheet"]').waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-follow-sheet"] header button').first().click();

  // Picking a button that's already in another slot swaps the two.
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-more-dock"]').click();
  await edit.waitFor({ timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-dock-pick-0-notices"]').click();
  await page.locator('[data-hpd-smoke="fc-dock-done"]').click();
  assert.deepEqual(await dockLabels(), ["Notices", "Follow-up", "AI", "Jobs", "More"]);

  // Stays after a reload.
  await load();
  assert.deepEqual(await dockLabels(), ["Notices", "Follow-up", "AI", "Jobs", "More"]);
  assert.match(await (await page.locator('[data-hpd-smoke="fc-more-open"]').click(), page.locator('[data-hpd-smoke="fc-more-dock"]')).innerText(), /Notices · Follow-up · Jobs/);
  await page.locator('[data-hpd-smoke="fc-more-dock"]').click();
  await page.locator('[data-hpd-smoke="fc-dock-reset"]').click();
  await page.locator('[data-hpd-smoke="fc-dock-done"]').click();
  assert.deepEqual(await dockLabels(), ["Jobs", "Bids", "AI", "Notices", "More"]);
  assert.deepEqual(errors, []);
  await c.close();
  console.log("PASS dock swap: see-through bottom; hold a bottom button -> picker on that slot (no screen opens); swap to Follow-up, Bids moves to the strip and still opens; swapping between slots; kept after reload; More -> Bottom buttons; reset");
} finally {
  await browser.close();
}
