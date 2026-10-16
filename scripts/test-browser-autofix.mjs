// Auto-fix a rejected affidavit / invoice at iPhone size (owner, 16 Oct): from HPD notices -> Rejected, "✨
// Auto-fix & preview" opens the paperwork, fixes it from HPD's reason (lists every change, what's already
// right and what to check by hand) and shows the preview. Reject deletes it and puts the old details back;
// Auto-fix again, Accept saves it to the fixed folder (HPD notices -> 🖨 To print). Nothing real changes.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const OMO = process.env.AUTOFIX_OMO || "EQ17038";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/api\/drive\//, (r) => r.fulfill({ status: 401, json: { connected: false } }));
  // The "it's in the mail" note: answered here (no real email); what would be sent is kept to check.
  const replies = [];
  await context.route(/\/api\/drive\/hpd-reply/, (r) => { replies.push(r.request().postDataJSON()); return r.fulfill({ json: { sent: true, to: replies.at(-1).to, messageId: "test" } }); });
  const rej = (await (await fetch(`${baseUrl}/data/hpd_requests.json`)).json()).jobs?.[OMO];
  assert.ok(rej?.rejectedReason, `${OMO} has HPD's reason`);
  await context.addInitScript((omo) => { if (localStorage.getItem("seeded")) return; localStorage.setItem("seeded", "1"); localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [omo]: { OMO: omo, FieldOutcome: "WORK_COMPLETED", ActualWorkStartDate: "2026-02-11", ActualWorkCompletionDate: "2026-02-11", PackageApprovedAt: "2026-02-12T15:00:00.000Z", PackageReviewStatus: "Approved", updatedAt: "2026-02-12T15:01:00.000Z" } })); }, OMO);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // From the Rejected tab.
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const link = page.locator('[data-hpd-smoke="fc-notices-rejected"] li', { hasText: OMO }).locator('[data-hpd-smoke="fc-notice-autofix"]');
  await link.waitFor({ timeout: 15000 });
  await link.click();
  await page.waitForURL(/\/paperwork\/.*auto=1/, { timeout: 30000 });
  // Fixed by itself, then the preview.
  const review = page.locator('[data-hpd-smoke="paperwork-correction-review"]');
  await review.waitFor({ timeout: 90000 });
  const box = review.locator('[data-hpd-smoke="paperwork-autofixed-review"]');
  const listed = await box.innerText();
  assert.match(listed, /Auto-fixed/);
  assert.ok(await box.locator("li").count() >= 1, "says what it changed / checked");
  const changed = await page.locator('[data-hpd-smoke="paperwork-autofix-change"]').allInnerTexts();
  assert.ok((await review.innerText()).includes(rej.rejectedReason.slice(0, 30)), "HPD's reason next to the preview");
  assert.ok(await page.locator('[data-hpd-smoke="paperwork-package-pages"] img').count() >= 3, "every page shown");
  // Reject: preview gone, old details back.
  await page.locator('[data-hpd-smoke="paperwork-correction-reject"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="paperwork-correction-review"]'), null, { timeout: 10000 });
  assert.equal(await box.count(), 0);
  assert.match(await page.locator('[data-hpd-smoke="paperwork-correction-status"]').innerText(), /Rejected: the fixed copy was deleted/);
  // Auto-fix again, Accept: saved to the fixed folder.
  await page.locator('[data-hpd-smoke="paperwork-autofix"]').click();
  await review.waitFor({ timeout: 90000 });
  await page.locator('[data-hpd-smoke="paperwork-correction-save"]').click();
  await page.locator('[data-hpd-smoke="paperwork-correction-saved"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="paperwork-correction-saved"]').innerText(), /fixed folder/);
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-tab-print"]').click();
  await page.locator('[data-hpd-smoke="fc-to-print-row"]', { hasText: OMO }).waitFor({ timeout: 15000 });
  // Tell HPD it's fixed and in the mail: to whoever signed the notice, shown first, sent on the second tap.
  const row = page.locator('[data-hpd-smoke="fc-to-print-row"]', { hasText: OMO });
  await row.locator('[data-hpd-smoke="fc-ack-open"]').click();
  const ack = row.locator('[data-hpd-smoke="fc-ack"]');
  await ack.waitFor();
  const head = await ack.locator("b").first().innerText();
  assert.match(head, /MICHAEL WRIGHT JR, CCAP <wrightmi@hpd\.nyc\.gov>/, `addressed to the notice's signer: ${head}`);
  const text = await ack.locator('[data-hpd-smoke="fc-ack-text"]').inputValue();
  assert.match(text, /^Hello Michael Wright Jr\.,/);
  assert.match(text, new RegExp(`OMO# ${OMO}`));
  assert.match(text, /A copy of the corrected affidavit and invoice is attached\.[\s\S]*on its way to you in the mail[\s\S]*Please let us know when you receive it/);
  assert.match(await ack.locator('[data-hpd-smoke="fc-ack-attach"]').innerText(), new RegExp(`${OMO} corrected affidavit and invoice \\(copy\\)\\.pdf`));
  // Send to me first: to the owner's own Gmail, nothing to HPD.
  await ack.locator('[data-hpd-smoke="fc-ack-me"]').click();
  await page.waitForFunction(() => /Sent to you/.test(document.querySelector('[data-hpd-smoke="fc-ack-status"]')?.textContent || ""), null, { timeout: 10000 });
  assert.equal(replies.length, 1); assert.equal(replies[0].toSelf, true); assert.ok(replies[0].attachment?.data, "with the copy attached");
  replies.length = 0;
  await ack.locator('[data-hpd-smoke="fc-ack-send"]').click();
  assert.equal(replies.length, 0, "first tap only arms");
  assert.match(await ack.locator('[data-hpd-smoke="fc-ack-send"]').innerText(), /Tap again: send to wrightmi@hpd\.nyc\.gov/);
  await ack.locator('[data-hpd-smoke="fc-ack-send"]').click();
  await row.locator('[data-hpd-smoke="fc-ack-done"]').waitFor({ timeout: 10000 });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].to, "wrightmi@hpd.nyc.gov");
  assert.equal(replies[0].text, text);
  assert.equal(replies[0].attachment?.name, `${OMO} corrected affidavit and invoice (copy).pdf`);
  assert.ok(Buffer.from(replies[0].attachment.data, "base64").subarray(0, 5).toString() === "%PDF-", "the fixed copy (a PDF) is attached");
  assert.match(await row.locator('[data-hpd-smoke="fc-print-steps"]').innerText(), /Copy emailed/);
  // The Rejected tab says it's fixed and in the print folder.
  await page.locator('[data-hpd-smoke="fc-notice-tab-rejected"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-notice-cleared-row"]', { hasText: OMO }).innerText(), /copy emailed, original to mail/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-notices-rejected"] li', { hasText: OMO }).count(), 0, "no longer waiting on you");
  assert.deepEqual(errors, []);
  console.log(`PASS auto-fix: ${OMO} from Rejected -> fixed from HPD's reason (${changed.length ? changed.join("; ") : "nothing needed changing"}) + preview; Reject deleted it and put the old details back; Accept saved it to 🖨 To print; "Email copy" to MICHAEL WRIGHT JR (wrightmi@hpd.nyc.gov) with the fixed PDF attached, shown first, sent only on the second tap; Rejected lists it as Cleared (no longer waiting)`);
  await context.close();
} finally {
  await browser.close();
}
