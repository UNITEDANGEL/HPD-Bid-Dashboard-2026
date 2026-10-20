// Bid pins show the kind of job (owner, 19 Oct: hinges, leak...): a picture in each pin with the due day under it, and
// the same picture on each row of the list.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

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
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".fc-bid-pin .fc-bid-ico").length > 0, null, { timeout: 30000 });
  const pins = await page.locator(".fc-bid-pin").evaluateAll((els) => els.map((e) => ({ ico: e.querySelector(".fc-bid-ico")?.getAttribute("data-icon") || "", glyph: !!e.querySelector(".fc-bid-ico svg path, .fc-bid-ico svg rect, .fc-bid-ico svg circle"), kind: getComputedStyle(e.querySelector(".fc-bid-in")).backgroundColor, ring: getComputedStyle(e.querySelector(".fc-bid-in")).boxShadow, bang: e.querySelectorAll("em.is-bad").length, failed: e.classList.contains("is-fax-failed"), day: e.querySelector("b")?.textContent || "", title: e.getAttribute("title") || "" })));
  assert.ok(pins.length > 0 && pins.every((p) => p.ico && p.day), `every pin has a picture and a day: ${JSON.stringify(pins.slice(0, 3))}`);
  assert.ok(pins.every((p) => / · [A-Z][^·]+ · /.test(p.title)), "the kind of job is in the pin's name");
  // A drawn picture (not an emoji) on a disc in the job's color, a due-color ring; "!" only on a failed fax.
  assert.ok(pins.every((p) => p.glyph), "every pin has the drawn picture");
  assert.ok(pins.every((p) => p.kind && p.kind !== "rgba(0, 0, 0, 0)" && p.kind !== "rgb(255, 255, 255)"), "colored disc");
  assert.ok(pins.every((p) => /rgb/.test(p.ring)), "due ring");
  assert.ok(pins.every((p) => p.bang === 0 || p.failed), "no ! except a failed fax");
  const colors = new Set(pins.map((p) => p.kind));
  const kinds = [...new Set(pins.map((p) => p.ico))];
  if (shots) await page.screenshot({ path: `${shots}/bid-icons-1.png` });
  await openBidList(page);
  const rowIcons = await page.locator('[data-hpd-smoke="fc-bid-row-ico"]').evaluateAll((els) => els.map((e) => !!e.querySelector("svg") && !!e.getAttribute("data-icon")));
  assert.ok(rowIcons.length > 0 && rowIcons.every(Boolean), "list rows show the picture");
  if (shots) await page.screenshot({ path: `${shots}/bid-icons-2.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS bid icons: ${pins.length} pins with a drawn job picture on its own color (${colors.size} colors for ${kinds.join(" ")}) + due ring and day, no stray "!", ${rowIcons.length} list rows with the picture`);
  await context.close();
} finally {
  await browser.close();
}
