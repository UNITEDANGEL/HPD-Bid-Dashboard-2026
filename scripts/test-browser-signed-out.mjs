// Signed out on the phone (owner, 22 Oct: "why 0 all"): when HPD's emails can't be opened (the Google sign-in ran out),
// the vendor tracking board says so with a Sign in with Google button that comes back to the board, and "Check my
// emails now" says it couldn't open them; never a board full of zeros that looks like "nothing to do".
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.route(/\/api\/private\//, (r) => r.fulfill({ status: 401, json: { error: "Sign in with Google" } }));
  await c.route(/\/api\/drive\/hpd-scan/, (r) => r.fulfill({ status: 401, json: { error: "Sign in" } }));
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1&board=1`, { waitUntil: "load", timeout: 180000 });
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor({ timeout: 60000 });
  const locked = board.locator('[data-hpd-smoke="fc-board-locked"]');
  await locked.waitFor({ timeout: 30000 });
  assert.match(await locked.innerText(), /Sign in with Google/);
  assert.match(await locked.getAttribute("action"), /^\/api\/drive\/start\?back=%2Fmap%2F%3Fview%3Dall%26map%3D1%26board%3D1$/);
  assert.equal(await board.getByText("Nothing from vendor tracking here right now").count(), 0, "not 'nothing to do'");
  await board.locator('[data-hpd-smoke="fc-scan-btn"]').click();
  await page.waitForFunction(() => /Couldn't open your HPD emails/.test(document.querySelector('[data-hpd-smoke="fc-scan-status"]')?.textContent || ""), null, { timeout: 15000 });
  if (shots) await page.screenshot({ path: `${shots}/signed-out.png` });
  // Search still works signed out (the public copy, contacts masked).
  await board.locator('[data-hpd-smoke="fc-board-close"]').click();
  await page.locator('[data-hpd-smoke="fc-search"]').fill("mini split");
  const find = page.locator('[data-hpd-smoke="fc-find"]');
  await find.locator('[data-hpd-smoke="fc-find-row"][data-omo="ER08283"]').waitFor({ timeout: 30000 });
  assert.match(await find.locator('[data-hpd-smoke="fc-find-public"]').innerText(), /signed in/);
  assert.deepEqual(errors, []);
  console.log("PASS signed out: the board shows 'Your HPD emails didn't open' + Sign in with Google (back to the board), Check my emails says it couldn't open them; no zeros pretending all is done");
  await c.close();
} finally {
  await browser.close();
}
