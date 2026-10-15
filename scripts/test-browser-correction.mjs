// Browser test at iPhone size: fixing a payment paperwork rejection on a job awarded before August 28,
// 2026 (HPD's earlier affidavit form). Preview first (nothing marked), the preview shows HPD's reason
// and every page; "It's right: save to print" keeps the PDF on the phone and notes the correction on
// the job; HPD notices lists it under Corrections to print; Signed & sent (two taps) clears it.
// The status server and Google are answered here: nothing real is changed.
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const OMO = process.env.CORRECTION_OMO || "EQ17038";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const posts = [];
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") posts.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.route(/\/api\/drive\//, (r) => r.fulfill({ status: 401, json: { connected: false } }));
  const requests = await (await fetch(`${baseUrl}/data/hpd_requests.json`)).json();
  const rej = requests.jobs?.[OMO];
  assert.ok(rej?.rejectedAt, `${OMO} has a rejection`);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/paperwork/?job=${OMO}&fix=${rej.rejectedAt}`, { waitUntil: "load", timeout: 180000 });
  const button = page.locator('[data-hpd-smoke="paperwork-generate-correction"]');
  await button.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="paperwork-generate-correction"]')?.disabled, null, { timeout: 60000 });
  const before = posts.length;
  await button.click();
  // 1. The preview opens (earlier form used, nothing marked yet).
  const review = page.locator('[data-hpd-smoke="paperwork-correction-review"]');
  try { await review.waitFor({ timeout: 60000 }); }
  catch { throw new Error(`no preview: ${await page.locator(".paperwork-pdf-status, [data-hpd-smoke=paperwork-correction-status]").first().innerText().catch(() => "?")}`); }
  assert.match(await review.innerText(), new RegExp(`${rej.rejectedAt}`));
  if (rej.rejectedReason) assert.ok((await review.innerText()).includes(rej.rejectedReason.slice(0, 30)), "HPD's reason shown");
  assert.match(await review.innerText(), /No signature pictures/);
  const pages = await page.locator('[data-hpd-smoke="paperwork-package-pages"] img').count();
  assert.ok(pages >= 3, `affidavit (2) + invoice pages shown (${pages})`);
  assert.equal(posts.slice(before).filter((p) => JSON.stringify(p).includes("RejectionCorrectedAt")).length, 0, "nothing marked before saving");
  // The PDF itself (to look at): earlier form, no signature pictures, notary stamp + today's date.
  const b64 = await page.evaluate(async () => {
    const a = document.querySelector('[data-hpd-smoke="paperwork-download-print-copy"]');
    const buf = new Uint8Array(await (await fetch(a.href)).arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const out = process.env.CORRECTION_PDF_OUT;
  if (out) fs.writeFileSync(out, Buffer.from(b64, "base64"));
  const text = Buffer.from(b64, "base64").length;
  assert.ok(text > 10000, "a real PDF");
  // 2. Save to print.
  await page.locator('[data-hpd-smoke="paperwork-correction-save"]').click();
  await page.locator('[data-hpd-smoke="paperwork-correction-saved"]').waitFor({ timeout: 10000 });
  // Noted on the job on this phone and queued for the status server.
  const local = await page.evaluate((omo) => ({ job: JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[omo] || {}, outbox: Object.keys(JSON.parse(Object.entries(localStorage).find(([k]) => /outbox/i.test(k))?.[1] || "{}")) }), OMO);
  assert.equal(local.job.RejectionCorrectedAt?.length, 10, "correction date on the job");
  assert.equal(local.job.RejectionCorrectedFor, rej.rejectedAt);
  assert.ok(local.outbox.includes(OMO), "queued to sync");
  // 3. HPD notices: Corrections to print (the map sends the queued change).
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  for (let i = 0; i < 30 && !posts.some((p) => JSON.stringify(p).includes("RejectionCorrectedAt")); i++) await page.waitForTimeout(500);
  assert.ok(posts.some((p) => JSON.stringify(p).includes("RejectionCorrectedAt")), "correction synced to the status server");
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const row = page.locator('[data-hpd-smoke="fc-to-print-row"]', { hasText: OMO });
  await row.waitFor({ timeout: 15000 });
  // The notices list scrolls (it used to be stuck).
  const scrolled = await page.evaluate(async () => { const b = document.querySelector('[data-hpd-smoke="fc-notices-body"]'); b.scrollTop = 800; await new Promise((r) => setTimeout(r, 100)); return { top: b.scrollTop, can: b.scrollHeight > b.clientHeight }; });
  assert.ok(!scrolled.can || scrolled.top > 0, "notices list scrolls");
  // Headless Chrome downloads PDFs rather than showing them: check what the button opens.
  await page.evaluate(() => { window.__opened = []; const o = window.open; window.open = (u, t) => { window.__opened.push(String(u)); return o.call(window, "about:blank", t); }; });
  await row.locator('[data-hpd-smoke="fc-to-print-open"]').click();
  const opened = await page.evaluate(async () => { const u = window.__opened[0] || ""; const r = u ? await fetch(u) : null; return { u, type: r ? (await r.blob()).type : "" }; });
  assert.match(opened.u, /^blob:/, "the saved PDF opens");
  assert.equal(opened.type, "application/pdf");
  await row.locator('[data-hpd-smoke="fc-to-print-sent"]').click();
  assert.match(await row.locator('[data-hpd-smoke="fc-to-print-sent"]').innerText(), /Tap again/);
  await row.locator('[data-hpd-smoke="fc-to-print-sent"]').click();
  await page.waitForFunction((omo) => ![...document.querySelectorAll('[data-hpd-smoke="fc-to-print-row"]')].some((r) => r.textContent.includes(omo)), OMO, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(`PASS correction (${OMO}, awarded before 8/28/26): preview with HPD's reason and ${pages} pages, nothing marked until saved, saved to print, listed in HPD notices (scrolls), opens, signed & sent clears it`);
} finally {
  await browser.close();
}
