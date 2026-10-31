// "Check my emails now" on the board (owner, 19 Oct: "I just answered almost all notices... auto check the sent email and
// update the notices"): opening the board checks by itself; the button checks again; a reply with PDFs on a notice moves it
// to 📤 Sent · waiting and the box lists what changed. Gmail is faked here.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  // Its own fresh 24-hour notice on a job with no paperwork (31 Oct: the real inbox had no notice left to answer, which
  // failed the test and blocked deploys; same as test-browser-vt-send).
  const SEED = "EQ15239";
  const seedAt = new Date(Date.now() - 3 * 3600000).toISOString();
  await routePrivate(context, { conversations: (d) => ({ ...d, threads: [{ id: "test-board-24", subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${SEED}`, omos: [SEED], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: seedAt, waiting: true,
    messages: [{ at: seedAt, from: "Test Tracker <test.tracker@hpd.nyc.gov>", hpd: true, mine: false, subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${SEED}`, text: `Please be advised OMO# ${SEED} is past due. Reply with the paperwork. Test Tracker, Vendor Tracking, test.tracker@hpd.nyc.gov`, files: [] }] }, ...(d.threads || [])] }) });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  let scans = 0;
  let reply = null; // what the fake Gmail answers on the 2nd check
  await context.route("**/api/drive/hpd-scan", (r) => {
    scans += 1;
    const old = { id: "h0", threadId: "t0", at: "2026-10-18T14:00:00Z", subject: "RE: older email", omos: [] };
    const fresh = { id: "h1", threadId: "t1", at: new Date().toISOString(), subject: "RE: 24 HR POOR PERFORMANCE NOTICE - OMO#EQ31364 received, thank you", omos: ["EQ31364"] };
    return r.fulfill({ json: { days: 7, checkedAt: new Date().toISOString(), sent: scans > 1 && reply ? [reply] : [], received: scans > 1 && reply ? [old, fresh] : [old] } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const board = page.locator('[data-hpd-smoke="fc-board"]');
  await board.locator('[data-hpd-smoke="fc-board-row"]').first().waitFor({ timeout: 20000 });
  await board.locator('[data-hpd-smoke="fc-scan-status"]').waitFor();
  assert.equal(scans, 1, "opening the board checks by itself");

  // A notice not answered yet, and its thread.
  const row = board.locator('[data-hpd-smoke="fc-board-row"][data-next="replied"]').filter({ hasNotText: "MISSING DOCS" }).first();
  const omo = await row.locator(".fc-board-job b").innerText();
  const threadId = await page.evaluate(async (o) => {
    const d = await (await fetch("/api/private/conversations", { credentials: "same-origin" })).json();
    return d.threads.find((t) => t.omos[0] === o && /performance|PPN/i.test(t.subject))?.id;
  }, omo);
  assert.ok(threadId, `thread for ${omo}`);
  reply = { id: "m1", threadId, at: new Date().toISOString(), subject: `RE: 24 HR POOR PERFORMANCE NOTICE - OMO#${omo}`, omos: [omo], files: true };

  await board.locator('[data-hpd-smoke="fc-scan-btn"]').click();
  await page.waitForFunction(() => /✓ Checked your email/.test(document.querySelector('[data-hpd-smoke="fc-scan-status"]')?.textContent || ""), null, { timeout: 15000 });
  assert.match(await board.locator('[data-hpd-smoke="fc-scan-status"]').innerText(), /1 sent to HPD \(1 with PDFs\)/);
  assert.match(await board.locator('[data-hpd-smoke="fc-scan-changed"]').innerText(), new RegExp(`${omo} 📤 Sent, waiting on them`));
  // It moved to 📤 Sent · waiting (22 Oct board tabs).
  await board.locator('[data-hpd-smoke="fc-board-side-waiting"]').click();
  const after = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ hasText: omo }).first();
  assert.equal(await after.getAttribute("data-next"), "confirmed");
  assert.match(await after.locator('[data-hpd-smoke="fc-board-clock"]').innerText(), /📤 Sent \d+\/\d+ · waiting \d+ d/);
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/scan-1.png` }); }
  // A new email from HPD (not there at the first check): a banner (and the chime), tap -> the board.
  const ping = page.locator('[data-hpd-smoke="fc-hpd-ping"]');
  await ping.waitFor({ timeout: 10000 });
  // An email on a 24-hour notice thread is a ⏱ notice alert (each kind its own, 20 Oct).
  assert.match(await ping.innerText(), /24-hour notice · EQ31364[\s\S]*received, thank you/);
  assert.equal(await ping.getAttribute("data-kind"), "notice");
  assert.equal(await page.locator('[data-hpd-smoke="fc-chime-toggle"]').count(), 1, "sound on / off");
  if (shots) await page.screenshot({ path: `${shots}/scan-2-ping.png` });
  assert.deepEqual(errors, []);
  console.log(`PASS scan: the board checked email on opening; "Check my emails now" found your reply with PDFs on ${omo} -> 📤 Sent · waiting, listed as changed; a new email from HPD rang and showed a banner`);
  await context.close();
} finally {
  await browser.close();
}
