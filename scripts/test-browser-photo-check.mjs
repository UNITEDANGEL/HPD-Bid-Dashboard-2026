// 📸 Photo check on the job card (owner idea 1, 3 Nov) at iPhone size, through the real Before / After buttons:
// a before photo only -> "No after photo yet"; a sharp after photo -> "All 2 photos look good"; then a blurry after
// photo -> "1 after photo looks blurry: take it again" with its picture. Checked on the phone; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "ER06362";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route("**/api/drive/**", (r) => r.fulfill({ json: {} }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // Test pictures made in the browser: a brick wall, and the same wall out of focus.
  const pic = async (blur) => Buffer.from((await page.evaluate((b) => {
    const cv = document.createElement("canvas"); cv.width = 800; cv.height = 600;
    const x = cv.getContext("2d");
    if (b) x.filter = "blur(10px)";
    x.fillStyle = "#b45309"; x.fillRect(0, 0, 800, 600);
    x.fillStyle = "#e7e5e4";
    for (let y = 0; y < 600; y += 40) { x.fillRect(0, y, 800, 6); for (let i = (y / 40) % 2 ? 0 : 50; i < 800; i += 100) x.fillRect(i, y, 6, 40); }
    return cv.toDataURL("image/jpeg", 0.9);
  }, blur)).split(",")[1], "base64");
  const sharp = await pic(false), soft = await pic(true);
  const add = async (stage, buffer, name) => {
    await page.locator(".jc-stage").nth(stage).click();
    const chooser = page.waitForEvent("filechooser");
    await page.locator(".fc-photo-source-actions button", { hasText: "Add photos" }).first().click();
    await (await chooser).setFiles({ name, mimeType: "image/jpeg", buffer });
  };
  const box = page.locator('[data-hpd-smoke="jc-photo-check"]');
  const waitText = (re) => page.waitForFunction((s) => new RegExp(s).test(document.querySelector('[data-hpd-smoke="jc-photo-check"]')?.textContent || ""), re.source, { timeout: 60000 });

  assert.equal(await box.count(), 0, "no photos and no work yet: nothing to check");
  await add(0, sharp, "before.jpg");
  await waitText(/No after photo yet/);
  await add(1, sharp, "after.jpg");
  await waitText(/All 2 photos look good for HPD/);
  assert.equal(await box.getAttribute("data-good"), "true");
  await add(1, soft, "after-2.jpg");
  await waitText(/1 after photo looks blurry: take it again/);
  assert.equal(await box.getAttribute("data-good"), "false");
  assert.equal(await page.locator(".jc-photo-check-bad img").count(), 1, "the blurry one is shown");
  const r = await box.boundingBox();
  assert.ok(r && r.width <= 390, "fits the iPhone");
  if (process.env.SHOTS) { await box.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOTS}/photo-check.png` }).catch(() => {}); }
  assert.deepEqual(errors, []);
  console.log("photo check browser ok");
} finally {
  await browser.close();
}
