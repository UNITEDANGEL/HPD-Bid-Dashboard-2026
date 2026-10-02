// Browser smoke test: drives the paperwork page like a field user and checks the generated PDF.
// Needs the app running (npm run dev). BASE_URL defaults to http://localhost:3000.
// Generates packages in the browser only; nothing is uploaded, emailed or synced.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const outDir = path.resolve("output/browser-smoke");
fs.mkdirSync(outDir, { recursive: true });

// Jobs awarded after 2026-08-28 (current affidavit form), with long addresses.
const cases = [
  { job: "ER05729", outcome: "work_completed", pages: 3 },
  { job: "ER05395", outcome: "no_access", pages: 3 },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const { job, outcome, pages } of cases) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=${outcome}`, { waitUntil: "networkidle" });
    // Email/PDF packages are always signed: blocked until a signature is saved (a test squiggle here).
    await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
    await page.getByText("Add your signature first").first().waitFor({ timeout: 10000 });
    await page.locator('[data-hpd-smoke="paperwork-signature-draw"]').click();
    const pad = await page.locator('[data-hpd-smoke="paperwork-signature-pad"]').boundingBox();
    await page.mouse.move(pad.x + 30, pad.y + 100);
    await page.mouse.down();
    for (let i = 0; i <= 20; i += 1) await page.mouse.move(pad.x + 30 + i * 12, pad.y + 80 + Math.sin(i / 2) * 30);
    await page.mouse.up();
    await page.locator('[data-hpd-smoke="paperwork-signature-save"]').click();
    if (outcome === "no_access") {
      // Attempts closer than 72 hours, or a missing call date, must block generation.
      await page.fill('[data-hpd-smoke="paperwork-attempt-1"]', "2026-10-01");
      await page.fill('[data-hpd-smoke="paperwork-attempt-2"]', "2026-10-02");
      await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
      await page.getByText("at least 72 hours apart").first().waitFor({ timeout: 10000 });
      await page.fill('[data-hpd-smoke="paperwork-attempt-2"]', "2026-10-04");
      if (await page.locator('[data-hpd-smoke="paperwork-call-1"]').count()) {
        await page.fill('[data-hpd-smoke="paperwork-call-1"]', "2026-09-30");
      }
    }
    await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
    await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
    // Every PDF page must render as a preview image (pdfjs failed on browsers without new JS APIs).
    await page.locator(".pkg-page img").nth(pages - 1).waitFor({ timeout: 30000 });
    assert.equal(await page.locator(".pkg-page img").count(), pages, `${job}: review must preview every page`);
    await page.screenshot({ path: path.join(outDir, `${job}-${outcome}.png`) });

    const href = await page.locator(`a[download$="-affidavit-invoice.pdf"]`).first().getAttribute("href");
    assert.ok(href, `${job}: no PDF link in package review`);
    const base64 = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let text = "";
      for (const byte of bytes) text += String.fromCharCode(byte);
      return btoa(text);
    }, href);
    const bytes = Buffer.from(base64, "base64");
    fs.writeFileSync(path.join(outDir, `${job}-${outcome}.pdf`), bytes);

    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), pages, `${job}: expected affidavit (2) + invoice (1) pages`);
    assert.equal(pdf.getForm().getFields().length, 0, `${job}: form fields must be flattened`);
    assert.ok(Buffer.from(bytes).toString("latin1").includes("/Subtype /Image"), `${job}: signature image must be in the PDF`);
    assert.deepEqual(errors, [], `${job}: page errors`);
    console.log(`PASS ${job} ${outcome}: package generated in browser, ${pages} flattened pages`);
    await page.close();
  }

  // Notary approval + Print Copy: the notary stamp/date must still fill in, but a print copy
  // has no signature images and must never show the Drive/email approve button -- it is a
  // plain download kept off Drive and out of the emailed package.
  {
    const job = "ER05729";
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=work_completed`, { waitUntil: "networkidle" });

    await page.locator('[data-hpd-smoke="paperwork-notary-pad"]').waitFor({ timeout: 10000 });
    const notaryPad = await page.locator('[data-hpd-smoke="paperwork-notary-pad"]').boundingBox();
    await page.mouse.move(notaryPad.x + 20, notaryPad.y + 40);
    await page.mouse.down();
    for (let i = 0; i <= 15; i += 1) await page.mouse.move(notaryPad.x + 20 + i * 8, notaryPad.y + 30 + Math.cos(i / 2) * 15);
    await page.mouse.up();
    await page.locator('[data-hpd-smoke="paperwork-notary-sign"]').click();
    await page.fill('[data-hpd-smoke="paperwork-notary-name"]', "Test Notary");
    await page.check('[data-hpd-smoke="paperwork-notary-witnessed"]');
    await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();

    await page.locator('[data-hpd-smoke="paperwork-generate-print"]').click();
    await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });

    assert.equal(await page.locator('[data-hpd-smoke="paperwork-download-print-copy"]').count(), 1, `${job}: print copy must show a plain download link`);
    assert.equal(await page.locator('[data-hpd-smoke="paperwork-approve-save"]').count(), 0, `${job}: print copy must not show the Drive/email approve button`);

    const printHref = await page.locator('[data-hpd-smoke="paperwork-download-print-copy"]').getAttribute("href");
    assert.ok(printHref, `${job}: no PDF link for the print copy`);
    const printBase64 = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let text = "";
      for (const byte of bytes) text += String.fromCharCode(byte);
      return btoa(text);
    }, printHref);
    const printBytes = Buffer.from(printBase64, "base64");
    fs.writeFileSync(path.join(outDir, `${job}-print-copy.pdf`), printBytes);

    const printPdf = await PDFDocument.load(printBytes);
    assert.equal(printPdf.getPageCount(), 3, `${job}: print copy expected affidavit (2) + invoice (1) pages`);
    assert.ok(!Buffer.from(printBytes).toString("latin1").includes("/Subtype /Image"), `${job}: print copy must have no signature/notary image`);
    assert.deepEqual(errors, [], `${job}: page errors`);
    console.log(`PASS ${job} print copy: notary date filled, no Drive/email approve button, no signature image`);
    await page.close();
  }
} finally {
  await browser.close();
}
