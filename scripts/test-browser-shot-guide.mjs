// 📷 Guided photos (owner, 6 Nov: "take a photo, approve it, upload it and ask me take the next one; when I'm done take
// me to the video for the before"): on an iPhone, TEST-0001 -> Before -> Take photo: "1 photo saved ✓" with Next photo
// / Before video / Done; two more photos -> the video button glows; Done closes it.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => { try { localStorage.setItem("hpd-safety-TEST-0001", "x"); } catch {} window.__said = []; if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=TEST-0001&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  const shoot = async (button) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), button.click()]);
    await chooser.setFiles({ name: "p.png", mimeType: "image/png", buffer: png });
  };
  // The first photo, as from the camera (a new job starts on Before).
  await page.locator('input.fc-hidden-file[accept="image/*"][capture]').first().setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png });
  // The test picture is tiny, so it reads as blurry: "Keep it" (the owner's choice), then the guide shows.
  const keep = async () => { const k = page.locator('[data-hpd-smoke="jc-retake-keep"]'); await k.waitFor({ timeout: 20000 }); await k.click(); };
  await keep();
  const guide = page.locator('[data-hpd-smoke="jc-shot-guide"]');
  await guide.waitFor({ timeout: 20000 });
  assert.match(await guide.innerText(), /Before: 1 photo saved ✓/);
  for (const n of [2, 3]) {
    await shoot(page.locator('[data-hpd-smoke="jc-shot-next-photo"]'));
    await keep();
    await page.waitForFunction((k) => new RegExp(`Before: ${k} photos saved`).test(document.querySelector('[data-hpd-smoke="jc-shot-guide"]')?.textContent || ""), n, { timeout: 20000 });
  }
  assert.match(await page.locator('[data-hpd-smoke="jc-shot-video"]').getAttribute("class"), /jc-glow/, "after 3 photos: the video next");
  await page.locator('[data-hpd-smoke="jc-shot-done"]').click();
  assert.equal(await guide.count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS guided photos: each photo saved and counted, 'take the next one', after 3 the before video, Done closes");
} finally {
  await browser.close();
}
