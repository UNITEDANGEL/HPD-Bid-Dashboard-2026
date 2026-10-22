// From the 24 / 72-hour board to vendor tracking (owner, 17 Oct), tapped like the owner: a notice with no paperwork ->
// tick Reply sent -> "✅ Work completed" -> the paperwork page makes the package -> "📤 Send with the PDF" to the
// person who sent the notice (first tap only arms; the signed copy is attached) -> back on the board it's 📤 Sent.
// Who to send to rides in session storage, never in the page address.
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
  const replies = [];
  const otherDrive = [];
  await context.route("**/api/drive/**", (r) => {
    const url = r.request().url();
    if (url.endsWith("/api/drive/hpd-reply")) { const b = JSON.parse(r.request().postData() || "{}"); replies.push(b); return r.fulfill({ json: { sent: true, to: b.toSelf ? "owner@example.test" : b.to, attached: b.attachment?.name || "" } }); }
    if (url.endsWith("/api/drive/hpd-draft")) return r.fulfill({ json: { ai: false, reason: "not-set-up" } });
    otherDrive.push(url);
    return r.fulfill({ status: 401, json: { reconnectRequired: true, error: "test: not signed in" } });
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
  // A notice with nothing on record yet: tick "Reply sent" -> the paperwork is next.
  const row = board.locator('[data-hpd-smoke="fc-board-row"][data-next="replied"]').filter({ hasNotText: "paperwork on record" }).first();
  const omo = await row.locator(".fc-board-job b").innerText();
  await row.locator('[data-hpd-smoke="fc-board-step-replied"]').click();
  // Reply sent: it moves to 📤 Sent · waiting (22 Oct board tabs), the paperwork still next.
  await board.locator('[data-hpd-smoke="fc-board-side-waiting"]').click();
  const r2 =board.locator('[data-hpd-smoke="fc-board-row"]').filter({ hasText: omo }).first();
  assert.equal(await r2.getAttribute("data-next"), "made");
  const link = r2.locator('[data-hpd-smoke="fc-board-outcome-work_completed"]');
  const href = await link.getAttribute("href");
  assert.equal(href, `/paperwork/?job=${omo}&outcome=work_completed&vt=1`, "no email address in the page address");
  await link.click();

  // The paperwork page: sign (test squiggles), notary approves, the package is made.
  await page.waitForURL(/\/paperwork\//);
  // The job was awarded months ago and the work date is today: the old-job date check asks first (20 Oct); here the
  // dates are right (the job is being finished now), so say so.
  const oldDates = page.locator('[data-hpd-smoke="paperwork-old-dates-ok-btn"]');
  if (await oldDates.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) await oldDates.click();
  await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
  await page.locator('[data-hpd-smoke="paperwork-signature-quick"]').click();
  await page.locator('[data-hpd-smoke="paperwork-signature-preview"]').waitFor();
  await page.locator('[data-hpd-smoke="paperwork-notary-quick"]').click();
  await page.locator('[data-hpd-smoke="paperwork-notary-preview"]').waitFor();
  await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();
  // The notary's approval builds the package by itself.
  await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 120000 });
  const send = page.locator('[data-hpd-smoke="paperwork-vt-send"]');
  await send.waitFor({ timeout: 90000 });
  assert.match(await send.innerText(), /Send to vendor tracking: .+ <[a-z0-9._%+-]+@hpd\.nyc\.gov>/);
  assert.match(await send.locator('[data-hpd-smoke="paperwork-vt-text"]').inputValue(), new RegExp(`Re: OMO# ${omo}\\n\\nAttached is the affidavit and invoice`));
  if (shots) await page.screenshot({ path: `${shots}/vt-1-send.png` });
  // Send to me first, then the two-tap send.
  await send.locator('[data-hpd-smoke="paperwork-vt-me"]').click();
  await send.locator('[data-hpd-smoke="paperwork-vt-status"]', { hasText: "Sent to you" }).waitFor();
  assert.equal(replies[0].toSelf, true);
  await send.locator('[data-hpd-smoke="paperwork-vt-send-btn"]').click();
  assert.match(await send.locator('[data-hpd-smoke="paperwork-vt-send-btn"]').innerText(), /Tap again: send to/);
  assert.equal(replies.length, 1, "first tap only arms");
  await send.locator('[data-hpd-smoke="paperwork-vt-send-btn"]').click();
  await send.locator('[data-hpd-smoke="paperwork-vt-status"]', { hasText: "The board shows" }).waitFor();
  const sent = replies[1];
  assert.match(sent.to, /@hpd\.nyc\.gov$/);
  assert.match(sent.subject, /^RE: .*PERFORMANCE NOTICE/i);
  assert.ok(sent.attachment.data.startsWith("JVBER") && /\.pdf$/.test(sent.attachment.name), "the signed copy PDF is attached");
  if (shots) await page.screenshot({ path: `${shots}/vt-2-sent.png` });

  // Back on the board: Sent, waiting for them to confirm.
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  await board.locator('[data-hpd-smoke="fc-board-side-waiting"]').click();
  const back = board.locator('[data-hpd-smoke="fc-board-row"]').filter({ hasText: omo }).first();
  await back.waitFor({ timeout: 20000 });
  assert.equal(await back.getAttribute("data-next"), "confirmed");
  assert.match(await back.locator('[data-hpd-smoke="fc-board-clock"]').innerText(), /📤 Sent \d+\/\d+ · waiting \d+ d/);
  assert.deepEqual(errors, []);
  console.log(`PASS board -> vendor tracking: ${omo} ticked Reply sent, Work completed opened the paperwork (no email in the address), package made, Send to me first, then two taps sent ${sent.attachment.name} to ${sent.to.replace(/^[^@]+/, "***")}; the board shows 📤 Sent · waiting`);
  await context.close();
} finally {
  await browser.close();
}
