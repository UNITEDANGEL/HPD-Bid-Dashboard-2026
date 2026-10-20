// See what you sent (owner, 20 Oct: "point me to the paperwork that was sent; I need a link to see and confirm, not just
// the dates"): on the vendor tracking board, a notice whose paperwork was sent shows "📄 See what you sent" in Found on
// record -> the emails you sent for that job with their PDFs -> a PDF opens right there (pages, pinch to zoom) with
// "Open in Gmail". Your email is faked here (one email, one PDF); read-only.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
for (const t of ["AFFIDAVIT OF SERVICE - SENT COPY", "INVOICE - SENT COPY"]) doc.addPage([612, 792]).drawText(t, { x: 60, y: 700, size: 22, font });
const pdf = Buffer.from(await doc.save());

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const asked = [];
  await context.route("**/api/drive/hpd-sent", (r) => {
    const { omo } = JSON.parse(r.request().postData() || "{}");
    asked.push(omo);
    return r.fulfill({ json: { omo, emails: [{ id: "m0000000001", threadId: "19a0b1c2d3e4f5a6", at: "2026-10-19T14:05:00Z", to: '"Lewis, Joy-Ann (HPD)" <lewisj@hpd.nyc.gov>', subject: `RE: 24 HR POOR PERFORMANCE NOTICE - OMO#${omo}`, files: [{ i: 0, name: `${omo} AFF INVOICE.pdf`, size: pdf.length }] }] } });
  });
  await context.route("**/api/drive/hpd-sent-pdf", (r) => r.fulfill({ status: 200, body: pdf, headers: { "Content-Type": "application/pdf" } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor();
  const btn = board.locator('[data-hpd-smoke="fc-sent-open"]').first();
  await btn.waitFor({ timeout: 20000 });
  const omo = (await board.locator('[data-hpd-smoke="fc-board-row"]', { has: page.locator('[data-hpd-smoke="fc-sent-open"]') }).first().locator(".fc-board-job b").innerText()).trim();
  const row = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ has: page.locator(".fc-board-job b", { hasText: omo }) }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const box = row.locator('[data-hpd-smoke="fc-sent"]');
  await box.locator('[data-hpd-smoke="fc-sent-email"]').waitFor();
  assert.deepEqual(asked, [omo]);
  assert.match(await box.innerText(), new RegExp(`What you sent for ${omo}[\\s\\S]*10/19/26[\\s\\S]*Lewis, Joy-Ann \\(HPD\\)`));
  assert.equal(await box.locator('[data-hpd-smoke="fc-sent-gmail"]').getAttribute("href"), "https://mail.google.com/mail/u/0/#all/19a0b1c2d3e4f5a6");
  await box.locator('[data-hpd-smoke="fc-sent-file"]').click();
  const pages = box.locator('[data-hpd-smoke="fc-sent-pdf"] [data-hpd-smoke="fc-itb-thumb"]');
  await pages.first().waitFor({ timeout: 30000 });
  assert.equal(await pages.count(), 2, "both pages of the sent PDF");
  await pages.first().scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/sent-1.png` });
  // Full screen, zoomable (only the page zooms).
  await pages.first().click();
  await page.locator('[data-hpd-smoke="fc-itb-zoombox"]').waitFor();
  await page.locator('[data-hpd-smoke="fc-itb-close"]').click();
  assert.deepEqual(errors, []);
  console.log(`PASS see what you sent: ${omo} -> "📄 See what you sent" lists your email (10/19, to Joy-Ann Lewis) with ${omo} AFF INVOICE.pdf; both pages open right there, full screen + zoom; Open in Gmail links the thread`);
  await context.close();
} finally {
  await browser.close();
}
