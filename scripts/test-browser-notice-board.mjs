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
  assert.ok(clocks.every((c) => /left|OVERDUE|Sent · waiting/.test(c)), `countdowns: ${clocks.slice(0, 4)}`);
  assert.equal(await rows.first().locator('[data-hpd-smoke="fc-board-steps"] li').count(), 4);
  await page.waitForTimeout(700);
  if (shots) await page.screenshot({ path: `${shots}/board-1.png` });

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

  // Under 6 hours left (clock set to 3 hours before the 10/16 notices are due): the red reminder opens the board.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(ctx2);
  await ctx2.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const p2 = await ctx2.newPage();
  await p2.clock.install({ time: new Date("2026-10-17T17:00:00Z") });
  await p2.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  const alert = p2.locator('[data-hpd-smoke="fc-board-alert"]');
  await alert.waitFor({ timeout: 30000 });
  assert.match(await alert.innerText(), /\d+ notices? under 6 hours/);
  if (shots) await p2.screenshot({ path: `${shots}/board-3-alert.png` });
  await alert.click();
  await p2.locator('[data-hpd-smoke="fc-board"]').waitFor();
  assert.ok((await p2.locator('[data-hpd-smoke="fc-board-row"].is-hot').count()) > 0, "hot rows marked");
  await ctx2.close();
  assert.deepEqual(errors, []);
  console.log(`PASS notice board: ${n} notices (${sum.replace(/\s+/g, " ")}), countdowns + 4 steps, AI-written reply to ${omo} (+ owner note, rewrite; first tap only arms, nothing sent), hand tick kept after reload, under-6-hour reminder opens the board`);
} finally {
  await browser.close();
}
