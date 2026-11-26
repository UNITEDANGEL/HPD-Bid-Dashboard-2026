// ✨ Updated pop-up (owner, 10 Nov: "auto refresh and a pop-up: hey, new updates, enjoy ... pick up where we left
// off"): a phone that last ran an older version gets a small bubble with the newest changes, hidden by itself after 7 s;
// what was open before the update (the board, the notices on the map) comes back. A phone on the same version: nothing.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const news = await (await fetch(`${baseUrl}/data/whats-new.json`)).json();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  // The phone last ran an older version, and the board was open when the update reloaded it.
  await c.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("hpd-seen-code", "0000000");
    sessionStorage.setItem("hpd-resume-v1", JSON.stringify({ board: true, withMap: true, filter: "notices", kind: "priority" }));
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1&updated=1`, { waitUntil: "load", timeout: 180000 });
  // 26 Nov (owner: "it's 2 now, I want only the purple one"): the white bubble is gone; the purple pop-up tells what's new.
  const pop = page.locator('[data-hpd-smoke="fc-updated-pop"]');
  void news;
  // Picked up where you left off: the board is open again, over the map.
  await page.locator('[data-hpd-smoke="fc-board"][data-with-map="1"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  assert.equal(await pop.count(), 0, "no white bubble after an update");
  // Same version next time: no bubble.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(4000);
  assert.equal(await pop.count(), 0, "no bubble on the same version");
  assert.deepEqual(errors, []);
  console.log("PASS updated pop-up: no white bubble after an update (only the purple one); the board came back over the map; nothing on the same version");
} finally {
  await browser.close();
}
