// 📨 Proof it was sent (owner idea, 24 Nov: "each job shows the sent affidavit and invoice with the date, so you can
// answer HPD in one tap with the proof"): a job whose paperwork went to HPD shows the date on its card and
// "📄 See what you sent" opens the email + PDF; a job never sent shows no proof box. Email and sent list are faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function card(sent) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route("**/data/sent_paperwork.json", (r) => r.fulfill({ json: { jobs: sent } }));
  await context.route("**/api/drive/hpd-sent", (r) => r.fulfill({ json: { omo: JOB, emails: [{ id: "m1", threadId: "t1", at: "2026-10-22T15:00:00Z", to: '"Lewis, Joy-Ann (HPD)" <x@hpd.nyc.gov>', subject: `${JOB} AFF INVOICE`, files: [{ i: 0, name: `${JOB} AFF INVOICE.pdf`, size: 2048 }] }] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-tab-all"]').click(); // a sent job sits under Waiting on HPD
  await page.locator('[data-hpd-smoke="fc-jobs-search"]').fill(JOB);
  await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${JOB}"] button`).first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  await page.locator('[data-hpd-smoke="jc-status-media"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  return { context, page, errors, proof: page.locator('#fc-job-card [data-hpd-smoke="jc-proof"]') };
}
try {
  {
    const { context, page, errors, proof } = await card({ [JOB]: { sentAt: "2026-10-22", count: 2 } });
    await proof.waitFor({ timeout: 20000 });
    const text = (await proof.innerText()).replace(/\s+/g, " ");
    assert.match(text, /Proof it was sent/);
    assert.match(text, /Affidavit \+ invoice sent to HPD on Oct 22, 2026 · 2 emails/);
    const box = await proof.evaluate((el) => { const r = el.getBoundingClientRect(); return { right: r.right, vw: window.innerWidth, size: parseFloat(getComputedStyle(el.querySelector("span")).fontSize) }; });
    assert.ok(box.right <= box.vw && box.size >= 15, `fits the phone, big text: ${JSON.stringify(box)}`);
    assert.equal(await page.locator('#fc-job-card [data-hpd-smoke="fc-sent-open"]').count(), 1, "one See what you sent button on the card");
    await proof.locator('[data-hpd-smoke="fc-sent-open"]').click();
    await proof.locator('[data-hpd-smoke="fc-sent-email"]').waitFor({ timeout: 20000 });
    assert.match(await proof.innerText(), new RegExp(`${JOB} AFF INVOICE\.pdf`));
    if (shots) await page.screenshot({ path: `${shots}/job-proof.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    const { context, errors, proof } = await card({});
    assert.equal(await proof.count(), 0, "never sent: no proof box");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`PASS proof it was sent: ${JOB} sent 10/22 -> "📨 Proof it was sent · Oct 22, 2026 · 2 emails" on the card; See what you sent lists the AFF INVOICE PDF; never sent -> no box`);
} finally {
  await browser.close();
}
