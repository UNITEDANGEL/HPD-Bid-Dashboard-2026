// 🧾 Costs on the job (idea list: "receipt photo on the job: the amount goes to that job's costs"): on ER02330's card
// type "45.20 Home Depot door closer" with a receipt photo -> "Costs: $45.20 spent · $... left of $..."; the photo
// thumbnail shows (kept on the phone only), the cost goes to the status server as JobCosts (no photo in it);
// say "spent 20 on screws for ER02330" -> added; ✕ removes one.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const JOB = "ER02330";
// A tiny real PNG (a white 4x4 square) as the receipt.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4//8/AxJgYmBgAAA7+QED7sQhAQAAAABJRU5ErkJggg==", "base64");
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { try { posted.push(JSON.parse(r.request().postData() || "{}")); } catch { /* not json */ } return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  // The free picture AI, faked: it reads the receipt's total and store (no real AI in tests).
  const reads = [];
  await c.route("**/api/drive/hpd-photo", (r) => { reads.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { ai: true, text: "TOTAL 45.20 STORE Home Depot" } }); });
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const openJob = async () => {
    await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator('[data-hpd-smoke="fc-jobs-search"], .fc-jobs-search input').first().fill(JOB).catch(() => {});
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  };
  await openJob();

  const box = page.locator('[data-hpd-smoke="jc-costs"]');
  assert.match(await box.locator("summary").innerText(), /Add a cost \/ receipt/);
  await box.locator("summary").click();
  await page.locator('[data-hpd-smoke="jc-cost-file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => /✓/.test(document.querySelector('[data-hpd-smoke="jc-cost-photo"]')?.textContent || ""));
  // The receipt is read: the amount and store fill the box, to check; nothing saved yet.
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="jc-cost-input"]')?.value === "45.20 Home Depot", null, { timeout: 8000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-cost-reading"]').innerText(), /📷 Read \$45\.20 at Home Depot: check it, then Add/);
  assert.equal(reads.length, 1); assert.match(reads[0].question, /TOTAL 45\.20 STORE Home Depot/); assert.match(reads[0].image, /^data:image\/jpeg;base64,/);
  assert.equal(await box.locator('[data-hpd-smoke="jc-cost-row"]').count(), 0, "not saved before Add");
  await page.locator('[data-hpd-smoke="jc-cost-input"]').fill("45.20 Home Depot door closer");
  await page.locator('[data-hpd-smoke="jc-cost-save"]').click();
  await page.waitForFunction(() => /Costs: \$45\.20 spent · \$[\d,.]+ left of \$[\d,]+/.test(document.querySelector('[data-hpd-smoke="jc-costs"] summary')?.textContent || ""), null, { timeout: 5000 });
  const row = box.locator('[data-hpd-smoke="jc-cost-row"]').first();
  assert.match(await row.innerText(), /\$45\.20\s+Home Depot door closer/);
  assert.equal(await row.locator("img").count(), 1, "receipt thumbnail on the phone");
  assert.equal(await page.locator('[data-hpd-smoke="jc-cost-input"]').inputValue(), "");
  for (let i = 0; i < 40 && !posted.some((b) => b.key === JOB && JSON.stringify(b).includes("JobCosts")); i++) await page.waitForTimeout(250);
  const sent = posted.filter((b) => b.key === JOB && JSON.stringify(b).includes("JobCosts")).pop();
  assert.ok(sent, "JobCosts saved on the job");
  assert.ok(!JSON.stringify(sent).includes("data:image"), "no photo sent to the server");

  // Typed to the helper (same as saying it).
  // A fresh map (the cost is still there after a reload: saved on the phone first).
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-search"]').fill(`spent 20 on screws for ${JOB}`);
  await page.locator('[data-hpd-smoke="fc-search"]').press("Enter");
  await page.waitForFunction(() => /🧾 \$20 \(Screws\) saved on ER02330: \$65\.20 spent/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });

  // ✕ removes one.
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await openJob();
  await box.locator("summary").click();
  assert.equal(await box.locator('[data-hpd-smoke="jc-cost-row"]').count(), 2);
  await box.locator('[data-hpd-smoke="jc-cost-remove"]').first().click();
  await page.waitForFunction(() => /Costs: \$20 spent/.test(document.querySelector('[data-hpd-smoke="jc-costs"] summary')?.textContent || ""), null, { timeout: 5000 });

  assert.deepEqual(errors, []);
  console.log("PASS job costs: typed cost + receipt photo (phone only) -> spent / left of the award, saved on the job without the photo; \"spent 20 on screws\" adds; ✕ removes");
} finally {
  await browser.close();
}
