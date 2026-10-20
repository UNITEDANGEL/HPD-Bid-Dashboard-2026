// Browser test at iPhone size: fixing a payment paperwork rejection on a job awarded before August 28,
// 2026 (HPD's earlier affidavit form). Preview first (nothing marked), the preview shows HPD's reason
// and every page; "It's right: save to print" keeps the PDF on the phone and notes the correction on
// the job; HPD notices lists it under Corrections to print; Signed & sent (two taps) clears it.
// The status server and Google are answered here: nothing real is changed.
import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const OMO = process.env.CORRECTION_OMO || "EQ17038";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" /* an iPhone in New York: the app's "today" */ });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  const posts = [];
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") posts.push(JSON.parse(r.request().postData() || "{}"));
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.route(/\/api\/drive\//, (r) => r.fulfill({ status: 401, json: { connected: false } }));
  const requests = await (await fetch(`${baseUrl}/data/hpd_requests.json`)).json();
  const rej = requests.jobs?.[OMO];
  assert.ok(rej?.rejectedAt, `${OMO} has a rejection`);
  // The phone has this job's paperwork as sent (that's what HPD rejected): it used to lock the button.
  await context.addInitScript((omo) => { if (localStorage.getItem("seeded")) return; localStorage.setItem("seeded", "1"); localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [omo]: { OMO: omo, FieldOutcome: "WORK_COMPLETED", ActualWorkStartDate: "2026-02-11", ActualWorkCompletionDate: "2026-02-11", PackageApprovedAt: "2026-02-12T15:00:00.000Z", PackageEmailedAt: "2026-02-12T15:01:00.000Z", PackageReviewStatus: "Approved", updatedAt: "2026-02-12T15:01:00.000Z" } })); }, OMO);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/paperwork/?job=${OMO}&fix=${rej.rejectedAt}`, { waitUntil: "load", timeout: 180000 });
  const button = page.locator('[data-hpd-smoke="paperwork-generate-correction"]');
  await button.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="paperwork-generate-correction"]')?.disabled, null, { timeout: 60000 });
  // Signed by hand: no signature pad or notary approval on a correction.
  assert.equal(await page.locator("[data-hpd-smoke=paperwork-signature-card], .sig-card, [data-hpd-smoke^=paperwork-notary]").count(), 0, "no signature / notary cards");
  assert.ok(await button.isEnabled(), "preview button works on a job whose paperwork was sent before");
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
  // The pages zoom by themselves in full screen (20 Oct: only the job pages zoom, not the app): a two-finger pinch.
  await page.locator('[data-hpd-smoke="paperwork-package-pages"] .pkg-page').first().click();
  const zbox = page.locator('[data-hpd-smoke="paperwork-zoombox"]');
  await zbox.waitFor();
  {
    const cdp = await context.newCDPSession(page);
    const zb = await zbox.boundingBox();
    const cx = zb.x + zb.width / 2, cy = zb.y + 200;
    const t = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    await t("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 8; i++) await t("touchMove", [[cx - 30 - i * 10, cy], [cx + 30 + i * 10, cy]]);
    await t("touchEnd", []);
    await page.waitForTimeout(300);
    const z = Number(await zbox.getAttribute("data-zoom"));
    assert.ok(z > 2, `paperwork page pinch-zoomed (${z}x)`);
    assert.equal(await page.evaluate(() => window.visualViewport?.scale || 1), 1, "the app did not zoom");
  }
  await page.locator('[data-hpd-smoke="paperwork-full-screen-close"]').click();
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
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click(); await page.locator('[data-hpd-smoke="fc-notice-pick-list"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-tab-print"]').click(); // fixed paperwork waiting to print: its own tab
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
  // Printed, then the original mailed (two taps): it leaves the to-do list and is kept under Done with its dates.
  await row.locator('[data-hpd-smoke="fc-to-print-printed"]').click();
  await row.locator('[data-hpd-smoke="fc-print-steps"] li.is-done', { hasText: "Printed" }).waitFor({ timeout: 5000 });
  await row.locator('[data-hpd-smoke="fc-to-print-sent"]').click();
  assert.match(await row.locator('[data-hpd-smoke="fc-to-print-sent"]').innerText(), /Tap again/);
  await row.locator('[data-hpd-smoke="fc-to-print-sent"]').click();
  await page.waitForFunction((omo) => ![...document.querySelectorAll('[data-hpd-smoke="fc-to-print-row"]')].some((r) => r.textContent.includes(omo)), OMO, { timeout: 10000 });
  const done = page.locator('[data-hpd-smoke="fc-print-done-row"]', { hasText: OMO });
  assert.match(await done.textContent(), /printed .* mailed /, "kept under Done with the dates");
  assert.deepEqual(errors, []);
  // An older (2024-2025) job with no outcome or work dates on the phone: pick what happened, today's
  // date is refused, real dates entered, charge from PIP.
  const OLD = process.env.CORRECTION_OLD_OMO || "EP21054";
  const oldRej = requests.jobs?.[OLD];
  if (oldRej?.rejectedAt) {
    const p2 = await context.newPage();
    await p2.goto(`${baseUrl}/paperwork/?job=${OLD}&fix=${oldRej.rejectedAt}`, { waitUntil: "load", timeout: 180000 });
    // HPD's closing reason picks what happened; if HPD has none, the box asks.
    await p2.waitForFunction(() => document.querySelector('[data-hpd-smoke="paperwork-correction-dates"], [data-hpd-smoke="paperwork-correction-outcome"]'), null, { timeout: 60000 });
    await p2.waitForTimeout(3000);
    const outcomeBox = p2.locator('[data-hpd-smoke="paperwork-correction-outcome"]');
    if (await outcomeBox.count()) await outcomeBox.locator("button", { hasText: "Work done" }).click();
    await p2.locator('[data-hpd-smoke="paperwork-correction-dates"]').waitFor({ timeout: 10000 });
    await p2.waitForFunction(() => !document.querySelector('[data-hpd-smoke="paperwork-generate-correction"]')?.disabled, null, { timeout: 30000 });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); // the app's "today" is New York's
    await p2.locator('[data-hpd-smoke="paperwork-correction-start"]').fill(today);
    await p2.locator('[data-hpd-smoke="paperwork-correction-complete"]').fill(today);
    await p2.locator('[data-hpd-smoke="paperwork-generate-correction"]').click();
    assert.match(await p2.locator('[data-hpd-smoke="paperwork-correction-status"]').innerText(), /real work dates/, "today's date refused on an older job");
    await p2.locator('[data-hpd-smoke="paperwork-correction-start"]').fill("2025-03-20");
    await p2.locator('[data-hpd-smoke="paperwork-correction-complete"]').fill("2025-03-21");
    await p2.locator('[data-hpd-smoke="paperwork-generate-correction"]').click();
    await p2.locator('[data-hpd-smoke="paperwork-correction-review"]').waitFor({ timeout: 60000 });
    const pdfText = await p2.evaluate(async () => { const a = document.querySelector('[data-hpd-smoke="paperwork-download-print-copy"]'); return new Uint8Array(await (await fetch(a.href)).arrayBuffer()).length; });
    assert.ok(pdfText > 10000, "older job PDF made");
    await p2.close();
  }
  console.log(`PASS correction (${OMO}, awarded before 8/28/26): preview with HPD's reason and ${pages} pages, nothing marked until saved, saved to print, listed in HPD notices (scrolls), opens, signed & sent clears it; ${OLD} (2024-25): outcome from HPD or picked, today's date refused, real dates, preview made`);
} finally {
  await browser.close();
}
