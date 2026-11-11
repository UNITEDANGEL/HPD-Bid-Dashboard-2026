// ✨ Auto-fix from the notice (owner, 9 Nov: "I want the notices to be able to auto fix ER04312"). HPD's real email on
// ER04312 ("highlighted errors & missing information ... AFFIDAVIT- date directed by HPD is confirmation date of
// award"): the board's 👉 Do this says what to fix (line 2 = 09/04/26) and "✨ Auto-fix it now" opens the paperwork,
// which fixes it by itself from HPD's words and makes the preview: same work dates as sent, the award date handled
// (ER04312 was awarded 09/04/26: HPD's new form, no date on line 2), every box printed. Nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const OMO = "ER04312";
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const HPD_WORDS = "Good day Jot, Kindly see attached affidavit & invoice with highlighted errors & missing information. Please rectify and resubmit. AFFIDAVIT- date directed by HPD is confirmation date of award. Thank you.";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const L = "Joy-Ann Lewis <lewis.test@hpd.nyc.gov>";
  const msg = (at, from, text, mine = false, files = []) => ({ at, from, hpd: !mine, mine, subject: "x", text, files });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    { id: "t-er04312-notice", subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${OMO}`, omos: [OMO], kind: "past due", people: ["Joy-Ann Lewis"], count: 3, lastAt: ago(20), waiting: true, messages: [
      msg(ago(120), L, `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${OMO}.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov`),
      msg(ago(90), "me", "Attached.", true, [`${OMO} AFF INVOICE.pdf`]),
      msg(ago(20), L, HPD_WORDS, false, ["OMO#ER04312-INACCURATE&INCOMPLETE DOCS.pdf", "Outlook-abc.png"]),
    ] },
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/correction_dates\.json/, (r) => r.fulfill({ json: { generatedAt: "2026-11-09T00:00:00Z", jobs: {
    [OMO]: { awardDate: "2026-09-12", workStart: "2026-09-12", workComplete: "2026-09-12", outcome: "work_completed", sentAt: "2026-10-19" },
  },
  // 🖍 The boxes HPD marked, read from their scan ahead of time (scripts/fetch_hpd_marks.py; the real ER04312 copy).
  marks: { "t-er04312-notice": { omos: [OMO], at: ago(20), file: "x.pdf", pages: [
    { form: "work affidavit", page: 1, boxes: ["Line 2 date (directed by HPD)", "Work completion date"] },
    { form: "invoice", page: 3, boxes: ["OMO #", "Invoice #", "Invoice date", "Date work started", "Date work completed", "Trade", "Borough", "Building address", "Materials list"] },
  ] } } } }));
  const sends = [];
  const marked = [];
  const replies = [];
  // HPD's marked-up PDF from the email (here: an HPD form standing in for it).
  const pdf = (await import("node:fs")).readFileSync("public/templates/work-performed-affidavit-2025.pdf");
  await c.route("**/api/drive/**", (r) => {
    if (r.request().url().endsWith("/api/drive/hpd-reply")) { const b = JSON.parse(r.request().postData() || "{}"); replies.push(b); return r.fulfill({ json: { sent: true, to: b.toSelf ? "owner@example.test" : b.to, attached: b.attachment?.name || "" } }); }
    if (r.request().url().endsWith("/api/drive/hpd-thread-pdf")) { marked.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ status: 200, contentType: "application/pdf", body: pdf }); } if (/hpd-reply|email-package|fax/.test(r.request().url())) sends.push(r.request().url()); return r.fulfill({ status: 401, json: { reconnectRequired: true } }); });
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor({ timeout: 5000 }).catch(() => {}); if (!(await page.locator('[data-hpd-smoke="fc-board"]').count())) await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click(); // Notices opens the board itself (10 Nov)
  const row = page.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${OMO}"]`);
  await row.waitFor({ timeout: 20000 });
  const todo = row.locator('[data-hpd-smoke="fc-board-do"]');
  assert.equal(await todo.getAttribute("data-action"), "correct");
  const steps = await todo.locator('[data-hpd-smoke="fc-board-fix-steps"] li').allInnerTexts();
  assert.ok(steps.some((s) => /^Line 2 date \("directed by HPD on"\) = 09\/04\/26, the award confirmation date, not the work date\.$/.test(s)), steps.join(" | "));
  // 🖍 What HPD marked, in words, before opening anything.
  const boxes = todo.locator('[data-hpd-smoke="fc-hpd-marked-boxes"]');
  await boxes.waitFor({ timeout: 15000 });
  assert.deepEqual(await boxes.locator("li").allInnerTexts(), [
    "Affidavit: Line 2 date (directed by HPD), Work completion date",
    "Invoice: almost every box (9) — it reached HPD blank. The new copy prints every box.",
  ]);
  // 🔎 HPD's marked copy opens right on the card.
  const see = todo.locator('[data-hpd-smoke="fc-hpd-marked-open"]');
  assert.equal(await see.innerText(), "🔎 See what HPD marked (OMO#ER04312-INACCURATE&INCOMPLETE DOCS)");
  await see.click();
  await todo.locator('[data-hpd-smoke="fc-hpd-marked-pages"]').waitFor({ timeout: 30000 });
  assert.deepEqual(marked, [{ threadId: "t-er04312-notice" }]);
  const go = todo.locator('[data-hpd-smoke="fc-board-do-go"]');
  assert.equal(await go.innerText(), "✨ Auto-fix it now");
  assert.match(await go.getAttribute("href"), new RegExp(`^/paperwork/\\?job=${OMO}&fix=.+&reason=.+confirmation%20date%20of%20award.*&auto=1&vt=1&marked=t-er04312-notice$`));
  await go.click();
  await page.waitForURL(/\/paperwork\//);
  // It fixes itself and makes the preview.
  // The fixing details are folded under 🔧 See what was fixed (plan item 4): open it to read them.
  await page.locator('[data-hpd-smoke="paperwork-fixed-more"] > summary').click({ timeout: 120000 });
  const fixed = page.locator('[data-hpd-smoke="paperwork-autofixed"], [data-hpd-smoke="paperwork-autofixed-review"]').first();
  await fixed.waitFor({ timeout: 120000 });
  const said = await fixed.innerText();
  assert.match(said, /Line 2: made on HPD's new affidavit form \(awarded 09\/04\/2026\).*no date to fill/, said);
  assert.match(said, /Every box prints on the new copy/);
  assert.ok(!/Work dates: HPD says/.test(said), "work dates kept as sent");
  // And on the fix page, next to HPD's words.
  await page.locator('[data-hpd-smoke="fc-hpd-marked-open"]').first().waitFor({ timeout: 30000 });
  assert.match(await page.locator('[data-hpd-smoke="fc-hpd-marked-boxes"]').first().innerText(), /HPD marked:[\s\S]*Affidavit: Line 2 date \(directed by HPD\), Work completion date/);
  assert.equal(sends.length, 0, "nothing sent by itself");
  assert.equal(replies.length, 0, "nothing sent by itself");
  // 📤 Send the fixed copy back to who asked (owner, 9 Nov: "after fix I should be able to resend the fixed back to the
  // requested source"): Lewis, the corrected PDF attached, two taps.
  const back = page.locator('[data-hpd-smoke="paperwork-vt-send"]');
  await back.waitFor({ timeout: 30000 });
  assert.match(await back.innerText(), /Send the fixed copy back: Joy-Ann Lewis <lewis\.test@hpd\.nyc\.gov>/);
  assert.match(await back.locator('[data-hpd-smoke="paperwork-vt-text"]').inputValue(), /Attached is the corrected affidavit and invoice for this job\.\n- Every highlighted spot is fixed\.\n- Every box is filled in\.\n- Made on HPD's current affidavit form/);
  await back.locator('[data-hpd-smoke="paperwork-vt-send-btn"]').click();
  assert.equal(replies.length, 0, "first tap only arms");
  await back.locator('[data-hpd-smoke="paperwork-vt-send-btn"]').click();
  await back.locator('[data-hpd-smoke="paperwork-vt-status"]', { hasText: "Sent to" }).waitFor({ timeout: 30000 });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].to, "lewis.test@hpd.nyc.gov");
  assert.match(replies[0].subject, /^RE: 24 HR POOR PERFORMANCE NOTICE - OMO#ER04312/);
  assert.ok(replies[0].attachment?.data?.startsWith("JVBER"), "the corrected PDF is attached");
  // 📄 Emailed = a copy (10 Nov): the attached PDF carries the COPY watermark.
  {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(replies[0].attachment.data, "base64")), verbosity: 0 }).promise;
    const words = (await (await doc.getPage(1)).getTextContent()).items.map((i) => i.str).join(" ");
    assert.match(words, /COPY$/, "the emailed fix says COPY");
  }
  // ✅ Marked fixed and sent, archived (10 Nov): the status says so, it's saved for every phone, and with nothing else
  // in line the way back is to the notices on the map.
  assert.match(await back.locator('[data-hpd-smoke="paperwork-vt-status"]').innerText(), /Marked fixed and sent: it moved to ✅ Done on the board/);
  assert.equal(await page.evaluate((o) => Boolean(JSON.parse(localStorage.getItem("hpd-handled-v1") || "{}")[o]), OMO), true, "handled on this phone");
  await back.locator('[data-hpd-smoke="paperwork-vt-back"]').waitFor({ timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log("PASS notice auto-fix: ER04312's board card names the fix (line 2 = 09/04/26), Auto-fix it now opens the paperwork that fixes itself from HPD's words (new form: no date on line 2; every box prints; same work dates), then 📤 Send the fixed copy back went to Lewis with the corrected PDF on two taps");
} finally {
  await browser.close();
}
