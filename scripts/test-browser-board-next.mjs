// Notices flow on by themselves (owner, 23 Oct: "everything needs to flow auto ... I might want to come back"), with the
// real (encrypted) HPD emails at iPhone size: answer a notice (two taps; the email is faked, nothing leaves this test)
// -> the board moves on to the next notice still to answer (due soonest), scrolled to it with its reply being written
// -> "Back to" returns to the one just answered.
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
  const drafts = [];
  await context.route("**/api/drive/hpd-draft", (r) => { const b = JSON.parse(r.request().postData() || "{}"); drafts.push(b.omo); return r.fulfill({ json: { ai: true, model: "test", text: `Hello,\n\nRe: OMO# ${b.omo}\n\nAI reply.\n\nThank you,\nJot Singh` } }); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.waitFor({ timeout: 60000 });
  // To send side: the first notice with a reply button.
  const row = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ has: page.locator('[data-hpd-smoke="fc-board-reply"]') }).first();
  await row.waitFor({ timeout: 30000 });
  const omo = await row.getAttribute("data-omo");
  const toAnswer = await board.locator('[data-hpd-smoke="fc-board-row"]').filter({ has: page.locator('[data-hpd-smoke="fc-board-reply"]') }).count();
  await row.locator('[data-hpd-smoke="fc-board-reply"]').click();
  const send = row.locator('[data-hpd-smoke="fc-board-reply-send"]');
  await send.click();
  assert.equal(sent.length, 0, "the first tap only arms");
  await send.click();
  const note = board.locator('[data-hpd-smoke="fc-board-moved"]');
  await note.waitFor({ timeout: 10000 });
  assert.equal(sent.length, 1);
  if (toAnswer > 1) {
    const nextEl = note.locator('[data-hpd-smoke="fc-board-next"]');
    await nextEl.waitFor({ timeout: 10000 });
    const next = (await nextEl.innerText()).trim();
    assert.notEqual(next, omo, "moved on to another notice");
    const nextRow = board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${next}"]`).first();
    await nextRow.locator('[data-hpd-smoke="fc-board-reply-box"]').waitFor({ timeout: 10000 });
    await page.waitForFunction((o) => (document.querySelector(`[data-hpd-smoke="fc-board-row"][data-omo="${o}"] [data-hpd-smoke="fc-board-reply-text"]`)?.value || "").includes(`OMO# ${o}`), next, { timeout: 10000 });
    assert.ok(drafts.includes(next), "its reply is being written");
    assert.equal(sent.length, 1, "nothing more was sent by itself");
    await page.waitForTimeout(800);
    const box = await nextRow.boundingBox();
    assert.ok(box && box.y < 844 && box.y + 40 > 0, `${next} scrolled into view (y ${box?.y})`);
    if (shots) await page.screenshot({ path: `${shots}/board-next.png` });
    await note.locator('[data-hpd-smoke="fc-board-come-back"]').click();
    const back = board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${omo}"]`).first();
    await back.waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    const b2 = await back.boundingBox();
    assert.ok(b2 && b2.y < 844 && b2.y + 40 > 0, `back on ${omo} (y ${b2?.y})`);
    console.log(`PASS board flow: answered ${omo} (two taps) -> moved on to ${next} with its reply written, nothing else sent -> Back to ${omo}`);
  } else {
    console.log(`PASS board flow: answered ${omo}; it was the only one to answer`);
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
}
