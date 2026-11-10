// ✍️ Your real signature (owner, 10 Nov: "make my signature more real", sample: the signed ER05228 copy): the paperwork
// screen shows the real ink signature (from the private files, signed in), not typed letters, and "📷 Change it
// (photo)" is right there; a phone that had the typed stand-in gets the real one by itself.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/api\/drive\//, (r) => r.fulfill({ status: 401, json: { connected: false } }));
  // This phone had the typed stand-in.
  await c.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("hpd-signature-typed", "1"); localStorage.setItem("hpd-signer-signature-v1", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="); } });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/paperwork/?job=EQ15239&outcome=work_completed`, { waitUntil: "load", timeout: 180000 });
  const box = page.locator('[data-hpd-smoke="paperwork-real-sig"]');
  await box.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="paperwork-real-sig"]')?.classList.contains("is-typed"), null, { timeout: 15000 });
  const img = box.locator("img");
  const size = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight, src: el.src.slice(0, 22) }));
  assert.equal(size.src, "data:image/png;base64,");
  assert.ok(size.w > 200 && size.h > 100, `the real ink signature, not the 1-px stand-in: ${size.w}x${size.h}`);
  assert.match(await box.innerText(), /Your signature on every copy/);
  assert.match(await box.locator('[data-hpd-smoke="paperwork-real-sig-upload"]').innerText(), /Change it \(photo\)/);
  const saved = await page.evaluate(() => [localStorage.getItem("hpd-signature-typed"), (localStorage.getItem("hpd-signer-signature-v1") || "").length]);
  assert.equal(saved[0], null, "no longer the typed one");
  assert.ok(saved[1] > 1000, "saved on the phone");
  assert.deepEqual(errors, []);
  console.log(`PASS real signature: the typed stand-in was replaced by your ink signature (${size.w}x${size.h}) on this phone; Change it (photo) is on the screen`);
} finally {
  await browser.close();
}
