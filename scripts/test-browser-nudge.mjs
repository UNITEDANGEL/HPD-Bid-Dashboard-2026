// No answer -> ask them to confirm (owner, 19 Oct "next upgrade"): paperwork sent to vendor tracking, no answer for 5+ days ->
// the card says so with "⏰ Ask them to confirm" (a ready follow-up, two taps to send), and "⏰ Ask N to confirm" writes
// them all on one screen. After asking, the card waits 5 more days. The send is faked: nothing goes out.
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
  const sent = [];
  await context.route("**/api/drive/hpd-reply", (r) => { const b = JSON.parse(r.request().postData() || "{}"); sent.push(b); return r.fulfill({ json: { sent: true, to: b.to || "me" } }); });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A week from now (Mon 26 Oct): the replies sent 16-19 Oct have had no answer for 7+ days.
  await page.clock.install({ time: new Date("2026-10-26T16:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor();
  const open = board.locator('[data-hpd-smoke="fc-nudge-open"]');
  await open.waitFor({ timeout: 20000 });
  const n = Number((/Ask (\d+) to confirm/.exec(await open.innerText()) || [])[1]);
  assert.ok(n >= 1, await open.innerText());
  assert.match(await board.locator('[data-hpd-smoke="fc-board-quiet-count"]').innerText(), new RegExp(`⏰ ${n} no answer`));
  const quietRows = board.locator('[data-hpd-smoke="fc-board-row"]', { has: page.locator('[data-hpd-smoke="fc-board-quiet"]') });
  assert.equal(await quietRows.count(), n);
  const omo = (await quietRows.first().locator(".fc-board-job b").innerText()).trim();
  const row = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ has: page.locator(".fc-board-job b", { hasText: omo }) }).first(); // stays on this job after it stops asking
  const quietText = await row.locator('[data-hpd-smoke="fc-board-quiet"]').innerText();
  const days = Number((/No answer in (\d+) days/.exec(quietText) || [])[1]);
  assert.ok(days >= 5, quietText);
  await row.scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/nudge-1-card.png` });
  // One card: the follow-up is written; first tap only arms.
  await row.locator('[data-hpd-smoke="fc-board-nudge"]').click();
  const text = await row.locator('[data-hpd-smoke="fc-board-reply-text"]').inputValue();
  assert.match(text, new RegExp(`Re: OMO# ${omo}`));
  assert.match(text, /Following up: the (affidavit and invoice|photos) for this job were sent to you( on \d+\/\d+\/\d{4})?\. Can you please confirm/);
  const sendBtn = row.locator('[data-hpd-smoke="fc-board-reply-send"]');
  await sendBtn.click();
  assert.equal(sent.length, 0, "first tap only arms");
  assert.match(await sendBtn.innerText(), /Tap again: send to .+@hpd\.nyc\.gov/);
  if (shots) await page.screenshot({ path: `${shots}/nudge-2-reply.png` });
  await sendBtn.click();
  await row.locator(".fc-ack-status", { hasText: "waits 5 more days" }).waitFor();
  assert.equal(sent.length, 1);
  assert.match(sent[0].to, /@hpd\.nyc\.gov$/);
  // That card stops asking; the others still do.
  assert.equal(await board.locator('[data-hpd-smoke="fc-board-quiet"]').count(), n - 1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-notice-nudged") || "{}"));
  assert.equal(Object.keys(stored).length, 1);
  // All of them on one screen (when more are left).
  if (n > 1) {
    await board.locator('[data-hpd-smoke="fc-nudge-open"]').click();
    const items = board.locator('[data-hpd-smoke="fc-batch-item"]');
    assert.equal(await items.count(), n - 1);
    assert.match(await items.first().locator('[data-hpd-smoke="fc-batch-text"]').inputValue(), /Following up:/);
    await items.first().locator('[data-hpd-smoke="fc-batch-send"]').click();
    assert.equal(sent.length, 1, "batch first tap only arms");
    if (shots) await page.screenshot({ path: `${shots}/nudge-3-batch.png` });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS no answer: ${n} sent with no answer 5+ days; ${omo} (${days} days) -> follow-up written, two taps sent it, card stops asking; "Ask ${n} to confirm" writes the rest on one screen`);
  await context.close();
} finally {
  await browser.close();
}
