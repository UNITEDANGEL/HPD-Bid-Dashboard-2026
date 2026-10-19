// The 24 / 72-hour board (owner, 17 Oct) with the real (encrypted) HPD emails, on an iPhone: Notices -> ⏱ board;
// every notice with its countdown and 4 steps; a ready reply (first tap only arms, nothing is sent); a step ticked
// by hand stays after reload; under 6 hours left, a red reminder on the map opens the board.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  let sends = 0;
  await context.route("**/api/drive/hpd-reply", (r) => { sends += 1; return r.fulfill({ status: 500, json: { error: "test: no sending" } }); });
  // The AI (server/ai-draft.mjs, tested in test-ai-draft): answers from the facts the board sends.
  const asked = [];
  await context.route("**/api/drive/hpd-draft", async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    asked.push(b);
    return r.fulfill({ json: { ai: true, model: "test", text: `Hello Joy-Ann,

Re: OMO# ${b.omo} - ${b.address}

AI reply${b.note ? ` (${b.note})` : ""}.

Thank you,
Jot Singh
United Angel Construction Corp` } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });

  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor();
  const rows = board.locator('[data-hpd-smoke="fc-board-row"]');
  await rows.first().waitFor({ timeout: 20000 });
  const n = await rows.count();
  const sum = await board.locator('[data-hpd-smoke="fc-board-sum"]').innerText();
  assert.match(sum, /\d+\s*open/);
  const clocks = await rows.locator('[data-hpd-smoke="fc-board-clock"]').allInnerTexts();
  assert.ok(clocks.every((c) => /left|OVERDUE|Sent · waiting|Waiting \d+ days|Done/.test(c)), `countdowns: ${clocks.slice(0, 4)}`);
  assert.equal(await rows.first().locator('[data-hpd-smoke="fc-board-steps"] li').count(), 4);
  // A head start on every notice: what's on record (with dates) and the next step, with its button.
  const found = rows.first().locator('[data-hpd-smoke="fc-found"]');
  assert.ok((await found.locator("li").count()) >= 1, "found on record");
  assert.match(await found.locator('[data-hpd-smoke="fc-found-next"]').innerText(), /^👉 .+/);
  assert.equal(await found.locator('[data-hpd-smoke="fc-found-go"]').count(), 1);
  const foundAll = await board.locator('[data-hpd-smoke="fc-found"]').count();
  const openRows = await board.locator('[data-hpd-smoke="fc-board-row"]:not(.is-done)').count();
  assert.equal(foundAll, openRows, "every open notice has its findings");
  await page.waitForTimeout(700);
  if (shots) await page.screenshot({ path: `${shots}/board-1.png` });
  // Missing documents (Gafur's lists): their own filter, one row per job with what they want.
  await board.locator('[data-hpd-smoke="fc-board-show-docs"]').click();
  const docRows = board.locator('[data-hpd-smoke="fc-board-row"]');
  await docRows.first().waitFor();
  const nDocs = await docRows.count();
  assert.ok(nDocs >= 5, `missing-documents rows: ${nDocs}`);
  assert.ok((await board.locator(".fc-board-row:not(.is-docs)").count()) === 0, "only missing documents");
  assert.match(await docRows.first().locator('[data-hpd-smoke="fc-board-want"]').innerText(), /They want: .+/);
  assert.match(await docRows.first().locator('[data-hpd-smoke="fc-board-clock"]').innerText(), /Waiting \d+ days|Sent · waiting/);
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: `${shots}/board-4-docs.png` });
  // Gafur's whole list in one email: a line per job with what's on record (sent on <date>, PDFs in another email) or
  // "update:" for you to fill in; Send refuses while an "update:" line is empty.
  const listBox = board.locator('[data-hpd-smoke="fc-list-reply"]').first();
  await listBox.locator('[data-hpd-smoke="fc-list-reply-open"]').click();
  const listText = await listBox.locator('[data-hpd-smoke="fc-list-reply-text"]').inputValue();
  assert.match(listText, /^Hello .+,\n\nThank you for the list\. Here is where each job stands:/);
  assert.match(listText, /EP27450 \([^)]*\) - affidavit and invoice sent on 10\/8\/26/i);
  assert.match(listText, /EP18784 \([^)]*\) - documents sent on 12\/10\/25/, "paperwork on record, with its date");
  assert.match(listText, /EP22713 \([^)]*\) - update: /, "a group email about many jobs doesn't count as sent for this one");
  assert.match(listText, /EN07390 \([^)]*\) - update: /);
  await listBox.locator('[data-hpd-smoke="fc-list-reply-send"]').click();
  await listBox.locator('[data-hpd-smoke="fc-list-reply-send"]').click();
  assert.match(await listBox.locator('[data-hpd-smoke="fc-list-reply-status"]').innerText(), /Fill in the lines that end with "update:"/);
  if (shots) await page.screenshot({ path: `${shots}/board-6-gafur.png` });
  await listBox.locator("button", { hasText: "Close" }).click();
  await board.locator('[data-hpd-smoke="fc-board-show-all"]').click();

  // The ready reply: says the OMO, first tap only arms.
  const row = board.locator('[data-hpd-smoke="fc-board-row"][data-next="replied"]').first();
  const omo = await row.locator(".fc-board-job b").innerText();
  await row.locator('[data-hpd-smoke="fc-board-reply"]').click();
  const box = row.locator('[data-hpd-smoke="fc-board-reply-box"]');
  await box.waitFor();
  // The AI writes it right away from the facts on record; you can tell it what to add and write again.
  await box.locator('[data-hpd-smoke="fc-board-ai-msg"]', { hasText: "Written by AI" }).waitFor({ timeout: 10000 });
  assert.match(await box.locator('[data-hpd-smoke="fc-board-reply-text"]').inputValue(), /AI reply./);
  assert.equal(asked[0].omo, omo);
  assert.ok(asked[0].noticeText.length > 0 && asked[0].dueAt && "steps" in asked[0], "the AI gets their notice and the facts");
  assert.ok(Array.isArray(asked[0].found) && asked[0].found.length > 0, "the AI gets what was found on record");
  await box.locator('[data-hpd-smoke="fc-board-ai-note"]').fill("we went back Friday");
  await box.locator('[data-hpd-smoke="fc-board-ai-write"]').click();
  await page.waitForFunction(() => /we went back Friday/.test(document.querySelector('[data-hpd-smoke="fc-board-reply-text"]')?.value || ""), null, { timeout: 10000 });
  assert.match(await box.locator('[data-hpd-smoke="fc-board-reply-text"]').inputValue(), new RegExp(`^Hello .*\\n\\nRe: OMO# ${omo}`));
  assert.match(await box.locator("b").first().innerText(), /@hpd\.nyc\.gov>/);
  await box.locator('[data-hpd-smoke="fc-board-reply-send"]').click();
  assert.match(await box.locator('[data-hpd-smoke="fc-board-reply-send"]').innerText(), /Tap again: send to/);
  assert.equal(sends, 0, "nothing sent on the first tap");
  if (shots) await page.screenshot({ path: `${shots}/board-2-reply.png` });
  await box.locator("button", { hasText: "Close" }).click();

  // Reply to many: every reply written on one screen; each Send still takes two taps; all to me first in one email.
  await board.locator('[data-hpd-smoke="fc-batch-open"]').click();
  const batch = board.locator('[data-hpd-smoke="fc-batch"]');
  await batch.waitFor();
  const items = batch.locator('[data-hpd-smoke="fc-batch-item"]');
  const nItems = await items.count();
  assert.ok(nItems >= 1, `batch items: ${nItems}`);
  assert.match(await items.first().locator('[data-hpd-smoke="fc-batch-text"]').inputValue(), /^Hello .*\n\nRe: OMO# [A-Z]{2}\d{5}/);
  await batch.locator('[data-hpd-smoke="fc-batch-self"]').click();
  await batch.locator('[data-hpd-smoke="fc-batch-self-status"]').waitFor();
  assert.equal(sends, 1, "all to me first: one email");
  await items.first().locator('[data-hpd-smoke="fc-batch-send"]').click();
  assert.match(await items.first().locator('[data-hpd-smoke="fc-batch-send"]').innerText(), /Tap again: send to .*@hpd\.nyc\.gov/);
  assert.equal(sends, 1, "first tap only arms");
  await batch.locator('[data-hpd-smoke="fc-batch-pick-all"]').click();
  assert.ok((await items.count()) >= nItems, "All shows at least as many");
  if (shots) await page.screenshot({ path: `${shots}/board-5-batch.png` });
  await batch.locator('[data-hpd-smoke="fc-batch-back"]').click();
  sends = 0;

  // Tick "Reply sent" by hand: the next step moves on, and it's kept after reload.
  await row.locator('[data-hpd-smoke="fc-board-step-replied"]').click();
  const ticked = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ hasText: omo }).first();
  assert.notEqual(await ticked.getAttribute("data-next"), "replied");
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  await board.locator('[data-hpd-smoke="fc-board-row"]').first().waitFor({ timeout: 20000 });
  const again = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ hasText: omo }).first();
  assert.match(await again.locator('[data-hpd-smoke="fc-board-step-replied"]').innerText(), /✓/);
  await again.locator('[data-hpd-smoke="fc-board-step-replied"]').click(); // undo
  await board.locator('[data-hpd-smoke="fc-board-close"]').click();
  await context.close();

  // Under 6 hours left (clock set to 8 AM Monday, 2 hours before the Friday notices are due at 10): the Notices button pulses red.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  // A fresh 24-hour notice (Monday 6 AM, nothing sent) so this check doesn't depend on which notices are answered.
  await routePrivate(ctx2, { conversations: (d) => ({ ...d, threads: [...d.threads, { id: "test-urgent", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99999", omos: ["EQ99999"], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: "2026-10-19T10:00:00Z", waiting: true, messages: [{ at: "2026-10-19T10:00:00Z", from: "test@hpd.nyc.gov", hpd: true, mine: false, subject: "24 HR", text: "Notice test@hpd.nyc.gov", files: [] }] }] }) });
  await ctx2.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const p2 = await ctx2.newPage();
  await p2.clock.install({ time: new Date("2026-10-20T07:00:00Z") }); // Tuesday 3 AM: the Monday 6 AM notice is due 6 AM, 3 hours left
  await p2.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  // The Notices button pulses red with an hours tag; Notices -> the board (pulsing) -> hot rows.
  const tag = p2.locator('[data-hpd-smoke="fc-urgent-tag"]');
  await tag.waitFor({ timeout: 30000 });
  assert.match(await tag.innerText(), /⏱ \d+ <6h/);
  assert.match(await p2.locator('[data-hpd-smoke="fc-notices-open"]').getAttribute("class"), /is-urgent/);
  if (shots) await p2.screenshot({ path: `${shots}/board-3-alert.png` });
  await p2.locator('[data-hpd-smoke="fc-notices-open"]').click();
  assert.match(await p2.locator('[data-hpd-smoke="fc-notice-board-open"]').innerText(), /under 6 h/);
  await p2.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  await p2.locator('[data-hpd-smoke="fc-board"]').waitFor();
  assert.ok((await p2.locator('[data-hpd-smoke="fc-board-row"].is-hot').count()) > 0, "hot rows marked");
  await ctx2.close();

  // City holiday (19 Oct): a 24-hour notice on Friday 9 Oct (Columbus Day Monday) is due Tuesday 10 AM, and the card says so.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(ctx3, { conversations: (d) => ({ ...d, threads: [...d.threads, { id: "test-holiday", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99998", omos: ["EQ99998"], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: "2026-10-09T18:00:00Z", waiting: true, messages: [{ at: "2026-10-09T18:00:00Z", from: "test@hpd.nyc.gov", hpd: true, mine: false, subject: "24 HR", text: "Notice test@hpd.nyc.gov", files: [] }] }] }) });
  await ctx3.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const p3 = await ctx3.newPage();
  await p3.clock.install({ time: new Date("2026-10-10T14:00:00Z") });
  await p3.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await p3.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await p3.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const holRow = p3.locator('[data-hpd-smoke="fc-board-row"]', { hasText: "EQ99998" });
  const due = holRow.locator('[data-hpd-smoke="fc-board-due"]');
  await due.waitFor({ timeout: 20000 });
  assert.match(await due.innerText(), /Due Tue, 10\/13, 10:00 AM · 🗓 Columbus Day not counted/);
  await due.scrollIntoViewIfNeeded();
  if (shots) await p3.screenshot({ path: `${shots}/board-4-holiday.png` });
  await ctx3.close();
  assert.deepEqual(errors, []);
  console.log(`PASS notice board: ${n} notices (${sum.replace(/\s+/g, " ")}), countdowns + 4 steps, AI-written reply to ${omo} (+ owner note, rewrite; first tap only arms, nothing sent), hand tick kept after reload, under 6 hours: the Notices button pulses red with an hours tag; Friday before Columbus Day -> due Tuesday 10 AM, holiday named`);
} finally {
  await browser.close();
}
