// 📋 Photo checklist per job (idea list): TEST-0001 on an iPhone starts with all four ⬜ (before photos, before video,
// after photos, after video); a before photo ticks "Before photos" (1 of 3) and the line says what's still to take.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const { photoChecklist, checklistLine } = await loadLib("photo-checklist");
const none = photoChecklist(null);
assert.deepEqual(none.map((i) => i.done), [false, false, false, false]);
const some = photoChecklist({ before: 4, beforeVideos: 1, after: 2, afterVideos: 0 });
assert.deepEqual(some.map((i) => [i.done, i.note]), [[true, "3 ✓"], [true, "1 ✓"], [true, "2 of 3"], [false, "none yet"]]);
assert.equal(checklistLine(some), "Still to take: after video");
assert.equal(checklistLine(photoChecklist({ before: 2, beforeVideos: 1, after: 2, afterVideos: 1 })), "All photos and videos HPD needs are saved ✓");

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => { try { localStorage.setItem("hpd-safety-TEST-0001", "x"); } catch {} if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=TEST-0001&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  const list = page.locator('[data-hpd-smoke="jc-photo-list"]');
  await list.waitFor({ timeout: 20000 });
  assert.equal(await list.locator("li.is-done").count(), 0);
  assert.match(await list.locator("b").first().textContent(), /^Still to take: before photos, before video, after photos, after video$/);
  await page.locator('input.fc-hidden-file[accept="image/*"][capture]').first().setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png });
  const keep = page.locator('[data-hpd-smoke="jc-retake-keep"]'); await keep.waitFor({ timeout: 20000 }); await keep.click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="jc-photo-list-before-photos"]')?.classList.contains("is-done"), null, { timeout: 20000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-photo-list-before-photos"]').textContent(), /✅Before photos1 of 3/);
  assert.match(await list.locator("b").first().textContent(), /^Still to take: before video, after photos, after video$/);
  assert.deepEqual(errors, []);
  console.log("PASS photo checklist: four items ⬜; a before photo ticks Before photos (1 of 3); the line lists what's left");
} finally {
  await browser.close();
}
