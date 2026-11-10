// 🗂 ✅ 🔥 (owner, 5 Nov): "go through each and every notice, take me to it, tell me what they ask and what to do";
// "a button that says I already sent it / fixed it"; "fixed in green, everything else in red"; "when I pick Gafur it
// should open her board". Seeded notices: one with nothing sent, one whose PDF went out in another email, one where HPD
// said the copy was blank. Nothing is sent: replies and the status server are faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const msg = (at, text, mine = false, files = []) => ({ at, from: mine ? "me" : "Test Tracker <test.tracker@hpd.nyc.gov>", hpd: !mine, mine, subject: "", text, files });
  const NOTHING = "EQ15239", SENT = "EQ15240", BLANK = "EQ15241";
  const seed = [
    { id: "t-walk-1", subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${NOTHING}`, omos: [NOTHING], messages: [msg(ago(30), `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${NOTHING}. test.tracker@hpd.nyc.gov`)] },
    { id: "t-walk-2", subject: `72 HR POOR PERFORMANCE NOTICE - OMO#${SENT}`, omos: [SENT], messages: [msg(ago(50), `Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#${SENT}. test.tracker@hpd.nyc.gov`)] },
    { id: "t-walk-2b", subject: `Re: OMO No: ${SENT}`, omos: [SENT], messages: [msg(ago(40), "Please find attached.", true, [`${SENT} AFF INVOICE.pdf`])] },
    { id: "t-walk-3", subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${BLANK}`, omos: [BLANK], messages: [msg(ago(48), `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${BLANK}. test.tracker@hpd.nyc.gov`), msg(ago(40), "Attached.", true, [`${BLANK} AFF INVOICE.pdf`]), msg(ago(39), "Hi Jot,\n\nPlease note the copy you just resubmitted is blank.\n\nRegards,")] },
  ].map((t) => ({ ...t, kind: "past due", people: ["Test Tracker"], count: t.messages.length, lastAt: t.messages.at(-1).at, waiting: true }));
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [...seed, ...(d.threads || [])] }) });
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") { posted.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { ok: true } }); } return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  await c.route("**/api/drive/hpd-reply", (r) => r.fulfill({ status: 500, json: { error: "test: no sending" } }));
  await c.route("**/api/drive/hpd-draft", (r) => r.fulfill({ json: { ai: true, text: "Hello,\n\nAI reply.\n\nThank you" } }));
  await c.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 20); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').first().click();

  // The board: red for nothing sent / HPD's problem, green for sent; the problem in HPD's words.
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-board"]').waitFor({ timeout: 5000 }).catch(() => {}); if (!(await page.locator('[data-hpd-smoke="fc-board"]').count())) await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click(); // Notices opens the board itself (10 Nov)
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  const row = (omo) => board.locator(`[data-hpd-smoke="fc-board-row"][data-omo="${omo}"]`);
  await row(NOTHING).waitFor({ timeout: 30000 });
  assert.equal(await row(NOTHING).getAttribute("data-state"), "todo");
  assert.equal(await row(NOTHING).locator(".fc-fire").count(), 1, "🔥 on a notice still to send");
  assert.equal(await row(BLANK).getAttribute("data-state"), "todo", "HPD said blank: back to send");
  // HPD's words sit under 📋 Details (9 Nov); on top, the plain fix: the copy was blank, send it again.
  assert.match(await row(BLANK).locator('[data-hpd-smoke="fc-board-problem"]').textContent(), /Please note the copy you just resubmitted is blank\./);
  assert.match(await row(BLANK).locator('[data-hpd-smoke="fc-board-do"]').innerText(), /Fix it: the copy was blank[\s\S]*send it again/);
  await board.locator('[data-hpd-smoke="fc-board-side-waiting"]').click();
  assert.equal(await row(SENT).getAttribute("data-state"), "ok", "its PDF in another email: green");
  assert.doesNotMatch(await row(SENT).locator('[data-hpd-smoke="fc-board-clock"]').innerText(), /OVERDUE/);
  await board.locator('[data-hpd-smoke="fc-board-side-tosend"]').click();

  // ✅ Already sent / fixed: first tap asks, second marks it on the status server and it goes to Done.
  const handled = row(BLANK).locator('[data-hpd-smoke="fc-board-handled"]');
  await handled.click();
  assert.match(await handled.innerText(), /Tap again/);
  assert.equal(posted.filter((p) => p.key === `HANDLED-${BLANK}`).length, 0, "first tap only asks");
  await handled.click();
  await page.waitForFunction((o) => !document.querySelector(`[data-hpd-smoke="fc-board-row"][data-omo="${o}"]:not(.is-done)`), BLANK, { timeout: 8000 });
  assert.ok(posted.some((p) => p.key === `HANDLED-${BLANK}` && p.patch?.at), "saved for every phone");
  // ✅ Done (10 Nov): its own tab, the archive.
  await board.locator('[data-hpd-smoke="fc-board-side-done"]').click();
  await row(BLANK).locator('[data-hpd-smoke="fc-board-handled-undo"]').waitFor();
  await board.locator('[data-hpd-smoke="fc-board-close"]').click();

  // 🗂 Go through my notices: one card per notice still to send, the map on it, what the email shows, what to do now.
  const say = async (text) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  };
  await say("go through my notices");
  const walk = page.locator('[data-hpd-smoke="fc-walk"]');
  await walk.waitFor({ timeout: 10000 });
  const total = Number((await walk.locator('[data-hpd-smoke="fc-walk-count"]').innerText()).match(/of (\d+)/)[1]);
  assert.ok(total >= 1);
  const seen = [];
  for (let i = 0; i < total; i += 1) {
    const omo = await walk.getAttribute("data-omo");
    seen.push(omo);
    assert.match(await walk.locator('[data-hpd-smoke="fc-walk-want"]').innerText(), /\w/);
    assert.match(await walk.locator('[data-hpd-smoke="fc-walk-email"]').innerText(), /✅|❌/);
    assert.match(await walk.locator('[data-hpd-smoke="fc-walk-next"]').innerText(), /^👉 /);
    assert.match(await walk.locator('[data-hpd-smoke="fc-walk-tenant"]').innerText(), /\w/);
    if (omo === NOTHING) {
      assert.match(await walk.locator('[data-hpd-smoke="fc-walk-email"]').innerText(), /❌ No affidavit or invoice/);
      assert.match(await walk.locator('[data-hpd-smoke="fc-walk-clock"]').innerText(), /OVERDUE|left/);
    }
    if (i + 1 < total) { await walk.locator('[data-hpd-smoke="fc-walk-next-btn"]').click(); await page.waitForFunction((o) => document.querySelector('[data-hpd-smoke="fc-walk"]')?.getAttribute("data-omo") !== o, omo); }
  }
  assert.ok(seen.includes(NOTHING), "the one with nothing sent is on the walk");
  assert.ok(!seen.includes(SENT), "sent & waiting is skipped");
  assert.ok(!seen.includes(BLANK), "marked fixed is skipped");
  await walk.locator('[data-hpd-smoke="fc-walk-next-btn"]').click();
  await walk.waitFor({ state: "detached" });
  await page.waitForFunction(() => /That's all \d+ notice/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  // ➡️ It moves on (owner, 5 Nov): the walk's end says the notices are done and offers the next part once.
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText(), /The notices are done\. (Bids next: \d+ left today\. Go\?|Your jobs next: .+ Go\?|That's everything for now\.)/);

  // "I already sent EQ15239" by voice: off the list.
  await say(`I already sent ${NOTHING}`);
  await page.waitForFunction((o) => new RegExp(`${o} marked sent`).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), NOTHING, { timeout: 5000 });
  assert.ok(posted.some((p) => p.key === `HANDLED-${NOTHING}`));

  // 📋 Picking Gafur: her jobs on the map with the list at the bottom (10 Nov), no board over it.
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-pick-aep"]').click();
  await page.waitForTimeout(800);
  assert.equal(await board.count(), 0, "the map, not the board");
  assert.deepEqual(errors, []);
  console.log(`PASS notice walk: board red / green with 🔥, HPD's "blank" shown and sent back, ✅ Already sent / fixed (two taps, every phone, Undo); go through my notices walked ${total} (${seen.join(", ")}), sent & fixed skipped, ends "That's all"; "I already sent …" by voice; Gafur shows her jobs on the map`);
} finally {
  await browser.close();
}
