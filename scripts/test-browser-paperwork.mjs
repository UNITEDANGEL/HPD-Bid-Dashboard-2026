// Browser smoke test: drives the paperwork page like a field user and checks the generated PDF.
// Needs the app running (npm run dev). BASE_URL defaults to http://localhost:3000.
// Generates packages in the browser only; nothing is uploaded, emailed or synced.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const outDir = path.resolve("output/browser-smoke");
fs.mkdirSync(outDir, { recursive: true });

// Drawn text (watermark, notary stamp) lives inside per-page content streams, which pdf-lib
// Flate-compresses and writes as hex strings ("<434F5059> Tj", not "(COPY) Tj"). Inflate every
// "stream...endstream" blob, then hex-decode every "<...>" run so plain substring checks can
// see through both the compression and the hex encoding.
function extractPdfText(bytes) {
  const raw = Buffer.from(bytes);
  const rawText = raw.toString("latin1");
  let out = rawText;
  const streamRe = /stream\r?\n/g;
  let match;
  while ((match = streamRe.exec(rawText))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) break;
    let chunk = raw.subarray(start, end);
    if (chunk.at(-1) === 0x0a) chunk = chunk.subarray(0, -1);
    if (chunk.at(-1) === 0x0d) chunk = chunk.subarray(0, -1);
    try {
      out += `\n${zlib.inflateSync(chunk).toString("latin1")}`;
    } catch {
      // Not Flate-compressed (or not a text stream) -- skip it.
    }
  }
  const hexDecoded = [...out.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .join("\n");
  return `${out}\n${hexDecoded}`;
}

const MONTH_NAMES = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
function ordinal(day) {
  if (day % 10 === 1 && day % 100 !== 11) return `${day}ST`;
  if (day % 10 === 2 && day % 100 !== 12) return `${day}ND`;
  if (day % 10 === 3 && day % 100 !== 13) return `${day}RD`;
  return `${day}TH`;
}
function todayJurat() {
  const now = new Date();
  return { day: ordinal(now.getDate()), month: MONTH_NAMES[now.getMonth()], year: String(now.getFullYear()).slice(-2) };
}

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
    if (outcome === "work_completed") {
      // One tap makes and saves both signatures; they must still be there after a reload.
      await page.locator('[data-hpd-smoke="paperwork-signature-quick"]').click();
      await page.locator('[data-hpd-smoke="paperwork-signature-preview"]').waitFor({ timeout: 10000 });
      await page.locator('[data-hpd-smoke="paperwork-notary-quick"]').click();
      await page.locator('[data-hpd-smoke="paperwork-notary-preview"]').waitFor({ timeout: 10000 });
      await page.reload({ waitUntil: "networkidle" });
      await page.locator('[data-hpd-smoke="paperwork-signature-preview"]').waitFor({ timeout: 10000 });
      await page.locator('[data-hpd-smoke="paperwork-notary-preview"]').waitFor({ timeout: 10000 });
      assert.equal(await page.locator('[data-hpd-smoke="paperwork-signature-quick"]').count(), 0, `${job}: saved signer signature must load`);
      await page.locator('[data-hpd-smoke="paperwork-signature-card"]').screenshot({ path: path.join(outDir, "signer-card.png") });
      await page.locator('[data-hpd-smoke="paperwork-notary-card"]').screenshot({ path: path.join(outDir, "notary-card.png") });
      // A saved notary signature is never placed without the witness confirmation.
      await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();
      await page.getByText("confirm they witnessed").first().waitFor({ timeout: 10000 });
      await page.locator('[data-hpd-smoke="paperwork-notary-witnessed"]').check();
      await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();
      await page.getByText("Notarized by Chetanpreet Malhi").first().waitFor({ timeout: 10000 });
    } else {
      // Finger signature on the pad.
      await page.locator('[data-hpd-smoke="paperwork-signature-draw"]').click();
      const pad = await page.locator('[data-hpd-smoke="paperwork-signature-pad"]').boundingBox();
      await page.mouse.move(pad.x + 30, pad.y + 100);
      await page.mouse.down();
      for (let i = 0; i <= 20; i += 1) await page.mouse.move(pad.x + 30 + i * 12, pad.y + 80 + Math.sin(i / 2) * 30);
      await page.mouse.up();
      await page.locator('[data-hpd-smoke="paperwork-signature-save"]').click();
    }
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
    if (outcome === "work_completed") {
      // The notary's approval is the last step: the package builds by itself, no Generate tap.
      await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
      // Signed and unsigned copies are reviewed together on the same screen.
      await page.locator('[data-hpd-smoke="paperwork-unsigned-copy"] .pkg-page img').nth(pages - 1).waitFor({ timeout: 30000 });
      assert.ok(await page.locator('[data-hpd-smoke="paperwork-download-unsigned"]').getAttribute("download"), `${job}: unsigned copy must be downloadable from the review screen`);
    } else {
      await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
    }
    await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
    // Every PDF page must render as a preview image (pdfjs failed on browsers without new JS APIs).
    await page.locator('[data-hpd-smoke="paperwork-package-pages"] .pkg-page img').nth(pages - 1).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('[data-hpd-smoke="paperwork-package-pages"] .pkg-page img').count(), pages, `${job}: review must preview every page`);
    await page.screenshot({ path: path.join(outDir, `${job}-${outcome}.png`) });

    const href = await page.locator('[data-hpd-smoke="paperwork-save-pdf"]').getAttribute("href");
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
    // Each signature PNG is two image objects (picture + transparency mask). The signer's is on the
    // affidavit and the invoice (4); the notary's adds 2 more.
    const imageCount = (Buffer.from(bytes).toString("latin1").match(/\/Subtype \/Image/g) || []).length;
    assert.ok(imageCount >= (outcome === "work_completed" ? 6 : 4), `${job}: signer${outcome === "work_completed" ? " and notary" : ""} signature images must be in the PDF (found ${imageCount})`);
    console.log(`  ${job}: ${imageCount} signature image(s) in the PDF`);
    assert.ok(/\bCOPY\b/.test(extractPdfText(bytes)), `${job}: emailed/Drive copy must carry the COPY watermark`);
    assert.deepEqual(errors, [], `${job}: page errors`);
    console.log(`PASS ${job} ${outcome}: package generated in browser, ${pages} flattened pages, COPY watermark present`);
    await page.close();
  }

  // Job card flow: "Review & Approve Package" opens the page with auto=package. It must wait for the
  // signer and the notary, build by itself, and on approve email ONLY the signed copy while the
  // unsigned print copy goes to the same Drive folder. Google is faked here; nothing is sent.
  {
    const job = "ER05729";
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    const uploads = [];
    const emails = [];
    let filing = null;
    await page.route("**/api/drive/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/session")) return route.fulfill({ json: { configured: true, connected: true, canEmail: true, email: "test@example.com" } });
      if (url.includes("/package-folder")) {
        filing = JSON.parse(route.request().postData() || "{}");
        return route.fulfill({ json: { folderId: "TEST-FOLDER", link: "https://drive.example/TEST-FOLDER" } });
      }
      if (url.includes("/package-file")) {
        uploads.push(decodeURIComponent(route.request().headers()["x-hpd-name"] || ""));
        return route.fulfill({ json: { ok: true } });
      }
      if (url.includes("/email-package")) {
        emails.push({ subject: decodeURIComponent(route.request().headers()["x-hpd-subject"] || ""), body: route.request().postData() || "" });
        return route.fulfill({ json: { to: ["test@example.com"] } });
      }
      return route.fulfill({ json: {} });
    });

    await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=work_completed&doc=package&auto=package&media=none`, { waitUntil: "networkidle" });
    await page.locator('[data-hpd-smoke="paperwork-signature-quick"]').click();
    await page.locator('[data-hpd-smoke="paperwork-notary-quick"]').click();
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-hpd-smoke="paperwork-package-review"]').count(), 0, `${job}: auto package must wait for the notary's approval`);
    await page.locator('[data-hpd-smoke="paperwork-notary-witnessed"]').check();
    await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();
    // No Generate tap: the package builds by itself after the notary approves.
    await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 });
    await page.locator('[data-hpd-smoke="paperwork-unsigned-copy"]').waitFor({ timeout: 30000 });
    await page.locator(".pkg-confirm input").check();
    await page.locator('[data-hpd-smoke="paperwork-approve-save"]').click();
    await page.locator('[data-hpd-smoke="paperwork-drive-link"]').waitFor({ timeout: 60000 });

    // Drive: filed by year / month / borough, one neatly named folder per package.
    assert.equal(filing.path.length, 3, `${job}: Drive filing path is year / month / borough`);
    assert.match(filing.path[0], /^20\d\d$/);
    assert.match(filing.path[1], /^\d\d - [A-Z][a-z]+$/);
    assert.match(filing.name, new RegExp(`^20\\d\\d-\\d\\d-\\d\\d - ${job} - .+ - Work Completed$`), filing.name);
    assert.ok(uploads.includes(`SIGNED - ${job} - Work Completed.pdf`), `${job}: signed PDF saved to Drive (got ${uploads.join(", ")})`);
    assert.ok(uploads.includes(`NOT SIGNED - print copy - ${job} - Work Completed.pdf`), `${job}: unsigned print copy saved to Drive`);
    // Only the SIGNED email goes out; the unsigned copy is Drive only.
    assert.equal(emails.length, 1, `${job}: expected only the SIGNED email, got ${emails.map((e) => e.subject).join(" | ")}`);
    const signedEmail = emails[0];
    assert.ok(signedEmail.subject.startsWith("SIGNED - "), signedEmail.subject);
    assert.ok(signedEmail.body.includes(`SIGNED - ${job} - Work Completed.pdf`) && !signedEmail.body.includes("NOT SIGNED"), `${job}: SIGNED email carries only the signed PDF`);
    // The SIGNED email gets forwarded: its message text must not carry the Google Drive link.
    const signedText = Buffer.from(signedEmail.body.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, ""), "base64").toString("utf8");
    assert.ok(signedText.startsWith("SIGNED COPY"), `${job}: could not read the SIGNED email text`);
    assert.ok(!/drive\.example|Google Drive/i.test(signedText), `${job}: SIGNED email must not include the Google Drive link`);
    assert.deepEqual(errors, [], `${job}: page errors`);
    console.log(`PASS ${job} job-card flow: waits for notary, builds by itself, emails only the SIGNED copy, files signed + unsigned in Drive ${filing.path.join(" / ")} / ${filing.name}`);
    await page.close();
  }

  // Print Copy, with NO digital notary step at all: the notary signs on paper, so the stamp
  // and today's jurat date must appear automatically -- never blank, never dependent on
  // someone remembering to run the on-screen notary approval first. No COPY watermark either,
  // since this copy is meant to become the signed original.
  {
    const job = "ER05729";
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=work_completed`, { waitUntil: "networkidle" });
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

    const printText = extractPdfText(printBytes);
    assert.ok(!/\bCOPY\b/.test(printText), `${job}: print copy must NOT carry the COPY watermark`);
    assert.ok(printText.includes("CHETANPREET MALHI"), `${job}: print copy must show the notary stamp even with no digital notary step`);
    assert.ok(printText.includes("Qualified in Queens County"), `${job}: print copy notary stamp text incomplete`);
    const jurat = todayJurat();
    assert.ok(printText.includes(`${jurat.day} ${jurat.month}`), `${job}: print copy jurat date must be today (${jurat.day} ${jurat.month}), not blank or a picked date`);
    assert.ok(printText.includes(jurat.year), `${job}: print copy jurat year must be today's year (${jurat.year})`);
    assert.deepEqual(errors, [], `${job}: page errors`);
    console.log(`PASS ${job} print copy: notary stamp + today's date filled with no digital notary step, no watermark, no signature image`);
    await page.close();
  }
} finally {
  await browser.close();
}
