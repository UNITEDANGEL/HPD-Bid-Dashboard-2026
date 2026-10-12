// One-off generator (not part of CI): drives the paperwork page like a field user and saves
// every outcome x package-type combination as a real PDF so they can be eyeballed by hand.
// Needs the app running (npm run dev). BASE_URL defaults to http://localhost:3000.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const outDir = path.resolve("output/affidavit-samples");
fs.mkdirSync(outDir, { recursive: true });

async function signPad(page, padSelector, useSelector) {
  await page.locator(padSelector).waitFor({ timeout: 10000 });
  const pad = await page.locator(padSelector).boundingBox();
  await page.mouse.move(pad.x + 20, pad.y + 40);
  await page.mouse.down();
  for (let i = 0; i <= 18; i += 1) await page.mouse.move(pad.x + 20 + i * 9, pad.y + 30 + Math.sin(i / 2) * 20);
  await page.mouse.up();
  await page.locator(useSelector).click();
}

async function downloadPdf(page, hrefSelector, filePath) {
  const href = await page.locator(hrefSelector).first().getAttribute("href");
  if (!href) throw new Error(`No PDF link found for ${filePath} (selector ${hrefSelector})`);
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  }, href);
  const bytes = Buffer.from(base64, "base64");
  fs.writeFileSync(filePath, bytes);
  return bytes;
}

const cases = [
  { outcome: "work_completed", job: "ER05729", label: "Work Completed", fill: async () => {} },
  {
    outcome: "partial_work_completed",
    job: "ER05729",
    label: "Partial Work Completed",
    fill: async (page) => {
      await page.fill('[data-hpd-smoke="paperwork-partial-done"]', "INSTALLED 3 SELF CLOSING HINGES AT APT 1B ENTRANCE DOOR");
      await page.fill('[data-hpd-smoke="paperwork-partial-reason"]', "ADDITIONAL WORK WAS NEEDED THAT WAS NOT PART OF THE ORIGINAL SCOPE");
    },
  },
  {
    outcome: "no_access",
    job: "ER05395",
    label: "No Access",
    fill: async (page) => {
      await page.fill('[data-hpd-smoke="paperwork-attempt-1"]', "2026-09-28");
      await page.fill('[data-hpd-smoke="paperwork-attempt-2"]', "2026-10-01");
      // Item 4b: required when the job has a tenant phone number on file.
      if (await page.locator('[data-hpd-smoke="paperwork-call-1"]').count()) {
        await page.fill('[data-hpd-smoke="paperwork-call-1"]', "2026-09-28");
        await page.fill('[data-hpd-smoke="paperwork-call-2"]', "2026-10-01");
      }
    },
  },
  {
    outcome: "refused_access",
    job: "ER05729",
    label: "Refused Access",
    fill: async (page) => {
      await page.getByText("Use Male Tall Dark Hair").click();
    },
  },
  { outcome: "completed_by_others", job: "ER05729", label: "Completed By Others", fill: async () => {} },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
try {
  for (const { outcome, job, label, fill } of cases) {
    // The status server is live: answer it here so sample packages never land on real jobs.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (route) => route.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=${outcome}`, { waitUntil: "load", timeout: 90000 });
    await page.locator('[data-hpd-smoke="paperwork-signature-draw"]').waitFor({ timeout: 90000 });
    // Job data (address, dates) loads async into form state; filling custom fields before it
    // lands gets wiped when generateCompletePackage later merges in the loaded job record.
    await page.waitForFunction(() => !document.body.innerText.includes("Address from JSON"), { timeout: 30000 });
    await fill(page);

    // Signer's own signature.
    await page.locator('[data-hpd-smoke="paperwork-signature-draw"]').click();
    await signPad(page, '[data-hpd-smoke="paperwork-signature-pad"]', '[data-hpd-smoke="paperwork-signature-save"]');

    // Notary's own in-person digital approval.
    await signPad(page, '[data-hpd-smoke="paperwork-notary-pad"]', '[data-hpd-smoke="paperwork-notary-sign"]');
    await page.check('[data-hpd-smoke="paperwork-notary-witnessed"]');
    await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();

    // Signed digital copy: emailed/Drive package, COPY watermark, both signature images.
    await page.locator('[data-hpd-smoke="paperwork-generate-full-package"]').click();
    await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
    await page.locator(".pkg-page img").first().waitFor({ timeout: 30000 });
    const signedFile = path.join(outDir, `${outcome}-1-signed-digital.pdf`);
    await downloadPdf(page, 'a[download$="-affidavit-invoice.pdf"]', signedFile);
    await page.screenshot({ path: path.join(outDir, `${outcome}-1-signed-digital.png`), fullPage: true });

    // Back to the form, then the unsigned print copy: no watermark, no signature images, but
    // the notary stamp/today's date fill in automatically with no extra digital step needed.
    await page.locator('[data-hpd-smoke="paperwork-package-edit"]').click();
    await page.locator('[data-hpd-smoke="paperwork-generate-print"]').click();
    await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
    await page.locator(".pkg-page img").first().waitFor({ timeout: 30000 });
    const printFile = path.join(outDir, `${outcome}-2-print-no-signature.pdf`);
    await downloadPdf(page, '[data-hpd-smoke="paperwork-download-print-copy"]', printFile);
    await page.screenshot({ path: path.join(outDir, `${outcome}-2-print-no-signature.png`), fullPage: true });

    if (errors.length) console.error(`${label}: page errors`, errors);
    console.log(`DONE ${label} (${job}, ${outcome}): signed + print copy saved`);
    results.push({ outcome, label, signedFile, printFile });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\nAll ${results.length * 2} PDFs saved to ${outDir}`);
