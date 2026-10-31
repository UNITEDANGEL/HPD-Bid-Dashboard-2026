// Payment tracker (owner, 31 Oct "do 6"), on an iPhone with a real job: Procurement -> 💰 To get paid starts with
// "Every job sent: waiting for HPD to pay". A job PIP still shows open 150 days after its paperwork was sent is under
// Late with PIP's amount, a job sent after PIP's download is in the folded list (not late), and tapping a late job
// opens its job card. PIP's numbers and the Sent-mail list are set here for those two jobs.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const coa = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
const list = (Array.isArray(coa) ? coa : coa.jobs || coa.rows || []).filter((r) => r.OMO && r.BuildingAddress);
const [late, recent] = [list[0], list[1]];
const pipAsOf = new Date(Date.now() - 10 * 86400000).toISOString();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/\/data\/sent_paperwork\.json/, (r) => r.fulfill({ json: { generatedAt: new Date().toISOString(), jobs: { [late.OMO]: { sentAt: day(Date.now() - 150 * 86400000), count: 1 }, [recent.OMO]: { sentAt: day(Date.now() - 3 * 86400000), count: 1 } } } }));
  await context.route(/\/data\/pip_paid\.json/, (r) => r.fulfill({ json: { generatedAt: pipAsOf, source: "PIP Agreement Summary", jobs: { [late.OMO]: { status: "not paid yet", paid: 0, outstanding: 1234, closed: false, closedDate: "", lastDate: day(Date.now() - 140 * 86400000) } } } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 20, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-pick-rejected"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-mini-list"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-tab-money"]').click();
  const box = page.locator('[data-hpd-smoke="fc-paywait"]');
  await box.waitFor();
  assert.match(await box.locator("h4").innerText(), /Every job sent: waiting for HPD to pay/i);
  const sum = await box.locator('[data-hpd-smoke="fc-paywait-sum"]').innerText();
  assert.match(sum, /1\s*late: PIP shows them open after 90 days · \$1,234/);
  assert.match(sum, /2\s*sent, not paid yet/);
  assert.match(await box.locator('[data-hpd-smoke="fc-paywait-note"]').innerText(), /1 was sent after that, so it can't show as paid yet/);
  const lateRows = box.locator('[data-hpd-smoke="fc-paywait-late"] [data-hpd-smoke="fc-paywait-row"]');
  assert.equal(await lateRows.count(), 1);
  const lateText = await lateRows.first().innerText();
  assert.match(lateText, new RegExp(`${late.OMO}\\s*\\$1,234`));
  assert.match(lateText, /150 days waiting · open in PIP/);
  // The recent one: folded under "Waiting, not late", not late.
  await box.locator('[data-hpd-smoke="fc-paywait-rest"]').click();
  const recentRow = box.locator(`[data-hpd-smoke="fc-paywait-row"][data-omo="${recent.OMO}"]`);
  assert.match(await recentRow.innerText(), /3 days waiting · sent after PIP's last download/);
  if (shots) await page.screenshot({ path: `${shots}/pay-waiting.png` });
  // Tap the late job: its job card opens.
  await lateRows.first().locator("button").click();
  await page.waitForFunction((omo) => (document.querySelector('.fc-job-sheet')?.textContent || "").includes(omo), late.OMO, { timeout: 20000 });
  assert.deepEqual(errors, []);
  console.log(`PASS payment tracker: ${late.OMO} open in PIP 150 days after sending is under Late with $1,234; ${recent.OMO} sent 3 days ago is waiting (after PIP's download), not late; tapping the late one opens its job card`);
} finally {
  await browser.close();
}
