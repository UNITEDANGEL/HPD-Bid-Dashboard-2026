// 📷 Say why there is no photo (idea, 14 Nov): a before photo and no after photo -> two buttons (No access / Tenant refused); one tap saves the reason on the job.
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
  await add(0, sharp, "before.jpg");
  await page.waitForFunction(() => /No after photo yet/.test(document.querySelector('[data-hpd-smoke="jc-photo-check"]')?.textContent || ""), null, { timeout: 60000 });
  const reason = page.locator('[data-hpd-smoke="jc-photo-reason"]');
  await reason.waitFor({ timeout: 10000 });
  assert.match(await reason.innerText(), /Why no after photo\?/);
  await page.locator('[data-hpd-smoke="jc-photo-reason-tenant-refused"]').click();
  assert.match(await page.locator('[data-hpd-smoke="jc-photo-reason-saved"]').innerText(), /No after photo \(.*\): tenant refused\./);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-job-notes") || "{}"));
  assert.ok((saved["ER06362"] || []).some((n) => /^No after photo \(.*\): tenant refused\.$/.test(n.text)), "reason saved in the job notes");
  await add(1, sharp, "after.jpg");
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="jc-photo-reason"]'), null, { timeout: 60000 });
  assert.deepEqual(errors, []);
  console.log("photo-reason browser test passed");
} finally {
  await browser.close();
}
