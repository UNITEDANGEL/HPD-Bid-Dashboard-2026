// ⏳ "Days left to finish" card on the Home screen (plan, 21 Nov): open awarded jobs, late and closest first; a tap opens the job.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const day = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" }); };
  const job = (OMO, award, due) => ({ OMO, AwardDate: day(award), WorkCompletionDate: day(due), JobDescription: "PAINT", AwardAmount: "500", BuildingAddress: `${OMO.slice(-1)} Test Ave., 10472` });
  await page.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: [
    job("ZZ00003", -10, 6), job("ZZ00001", -20, -3), job("ZZ00002", -5, 1), job("ZZ00009", -5, 2), job("TEST-0001", -1, 1),
  ] }));
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { ZZ00009: { sentAt: "2026-11-20", count: 6 } } } }));
  await page.route("**/data/hpd_job_status.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  // 🚧 Not started yet: ZZ00003 had a visit (saved on the status server), ZZ00002 has nothing yet.
  await page.route(/hpd-status-worker\.[^/]+\.workers\.dev\/overrides/, (r) => r.fulfill({ json: { ok: true, overrides: { ZZ00003: { OMO: "ZZ00003", LastFieldVisitAt: "2026-11-24T15:00:00Z", BeforePhotoCount: 2 } } } }));
  // 📞 Late jobs: who to call (plan item 23): the tenant from the signed-in private data, or the super saved for the building.
  await page.route("**/api/private/tenants*", (r) => r.fulfill({ json: { jobs: { ZZ00001: { ItbTenantName: "ANA SMITH", ItbTenantPhone: "718 555 0142" }, ZZ00003: { ItbTenantName: "FAR AWAY", ItbTenantPhone: "718 555 0100" } }, bids: {} } }));
  await page.addInitScript(() => localStorage.setItem("hpd-building-contacts", JSON.stringify({ "2 TEST AVENUE": { name: "Super Joe", phone: "6465550177", savedAt: "2026-11-22" } })));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  // 💵 Maturity this week (plan item 35): ZZ00002 (1 day) then ZZ00003 (6 days); the late ZZ00001 stays on the ⏳ card.
  const mw = page.locator('[data-hpd-smoke="home-maturity-week"]');
  await mw.waitFor({ timeout: 10000 });
  const mwRows = await mw.locator('[data-hpd-smoke="home-maturity-week-row"]').allInnerTexts();
  assert.equal(mwRows.length, 2, mwRows.join(" | "));
  assert.match(mwRows[0], /^ZZ00002: \w{3}, \w{3} \d+ \(1 day left\)/);
  assert.match(mwRows[1], /^ZZ00003: \w{3}, \w{3} \d+ \(6 days left\)/);
  assert.match(await mw.innerText(), /2 jobs to finish and send by/);
  // 🚧 Not started yet (plan, 25 Nov): red tag on ZZ00002 only (ZZ00003 had a visit), plus the count line.
  await mw.locator('[data-hpd-smoke="home-maturity-week-notstarted-count"]').waitFor({ timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="home-maturity-week-notstarted"]').length === 1, null, { timeout: 10000 });
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-row"]').nth(0).locator('[data-hpd-smoke="home-maturity-week-notstarted"]').count(), 1);
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-row"]').nth(1).locator('[data-hpd-smoke="home-maturity-week-notstarted"]').count(), 0);
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-notstarted-count"]').innerText(), "🚧 1 not started yet (no visit or photo)");
  // 🟠 Before but no After (plan item 44): ZZ00003 has 2 Before photos saved and no After: orange tag on that row only.
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="home-maturity-week-needs-after"]').length === 1, null, { timeout: 10000 });
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-row"]').nth(1).locator('[data-hpd-smoke="home-maturity-week-needs-after"]').innerText(), "🟠 needs After");
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-needs-after-count"]').innerText(), "🟠 1 with Before but no After photo yet");
  // 📷 Ask the worker for the After photo (plan item 46): one orange button for ZZ00003 only; the share sheet gets job, address, finish date.
  const askBtns = mw.locator('[data-hpd-smoke="home-maturity-week-ask-after"]');
  assert.equal(await askBtns.count(), 1);
  assert.equal(await askBtns.first().innerText(), "📷 Ask worker for ZZ00003's After photo");
  const askBox = await askBtns.first().boundingBox();
  assert.ok(askBox && askBox.height >= 44 && askBox.x + askBox.width <= 390, "ask button is big enough and on screen");
  await page.evaluate(() => { window.__asked = null; navigator.share = async (d) => { window.__asked = d; }; });
  await askBtns.first().click();
  await page.waitForFunction(() => window.__asked, null, { timeout: 5000 });
  const asked = await page.evaluate(() => window.__asked);
  assert.equal(asked.title, "After photos for ZZ00003");
  assert.match(asked.text, /^Job ZZ00003 - 3 Test Ave\., 10472\nFinish by .*6 days left/);
  assert.doesNotMatch(asked.text, /FAR AWAY|718|\$/,"no tenant name, phone or money");
  assert.match(await mw.locator('[data-hpd-smoke="home-maturity-week-share-note"]').innerText(), /Asked for ZZ00003's After photos ✓/);
  // 💲 Money in this week's maturity: each row shows its award, plus the total ($500 + $500).
  assert.match(mwRows[0], /· \$500/);
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-total"]').innerText(), "💲 $1,000 riding on this week");
  assert.equal(await mw.locator('[data-hpd-smoke="home-maturity-week-row"]').first().getAttribute("href"), "/map/?omo=ZZ00002");
  const mwBox = await mw.boundingBox();
  assert.ok(mwBox && mwBox.width <= 390, "maturity card fits the iPhone width");
  // 🗺 Route for this week's maturity (plan item 39): one button with just those jobs, closest date first.
  const routeBtn = mw.locator('[data-hpd-smoke="home-maturity-week-route"]');
  assert.equal(await routeBtn.getAttribute("href"), "/map/?route=ZZ00002,ZZ00003");
  assert.equal(await routeBtn.innerText(), "🗺 Route for these 2 jobs");
  const routeBox = await routeBtn.boundingBox();
  assert.ok(routeBox && routeBox.height >= 44 && routeBox.x + routeBox.width <= 390, "route button is big enough and on screen");
  // 📤 Send this week's list to the worker: the Share menu gets OMO, address and finish date; no tenant names, phones or money.
  await page.evaluate(() => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; });
  const shareBtn = mw.locator('[data-hpd-smoke="home-maturity-week-share"]');
  const shareBox = await shareBtn.boundingBox();
  assert.ok(shareBox && shareBox.height >= 44 && shareBox.x + shareBox.width <= 390, "share button is big enough and on screen");
  await shareBtn.click();
  await mw.locator('[data-hpd-smoke="home-maturity-week-share-note"]').waitFor({ timeout: 5000 });
  const shared = await page.evaluate(() => window.__shared);
  assert.ok(shared && shared.text, "the Share menu opened with the list");
  assert.match(shared.text, /^Jobs to finish this week \(2\)/);
  assert.match(shared.text, /1\. ZZ00002 - 2 Test Ave\., 10472\n   Finish by \w{3}, \w{3} \d+ \(1 day left\)/);
  assert.match(shared.text, /2\. ZZ00003 - 3 Test Ave\., 10472/);
  assert.ok(!/\$|ANA SMITH|555/.test(shared.text), "no money, tenant names or phones");
  const card = page.locator('[data-hpd-smoke="home-countdown"]');
  await card.waitFor({ timeout: 10000 });
  const rows = await card.locator('[data-hpd-smoke="home-countdown-row"]').allInnerTexts();
  assert.equal(rows.length, 3, rows.join(" | "));
  assert.match(rows[0], /^ZZ00001: 3 days late/);
  assert.match(rows[1], /^ZZ00002: 1 day left/);
  assert.match(rows[2], /^ZZ00003: 6 days left/);
  assert.match(await card.innerText(), /3 awarded jobs not sent yet/);
  assert.equal(await card.locator('[data-hpd-smoke="home-countdown-row"]').first().getAttribute("href"), "/map/?omo=ZZ00001");
  const calls = card.locator('[data-hpd-smoke="home-countdown-call"]');
  await calls.nth(1).waitFor({ timeout: 10000 });
  assert.deepEqual(await calls.allInnerTexts(), ["📞 Call Ana", "📞 Call Super Joe"], "late + almost-due jobs only (6 days left gets none)");
  assert.equal(await calls.first().getAttribute("href"), "tel:+17185550142");
  assert.equal(await calls.nth(1).getAttribute("href"), "tel:+16465550177");
  assert.equal(await calls.nth(1).getAttribute("data-kind"), "super");
  const callBox = await calls.first().boundingBox();
  assert.ok(callBox && callBox.height >= 40 && callBox.x + callBox.width <= 390, "call button is big enough and on screen");
  const box = await card.boundingBox();
  assert.ok(box && box.width <= 390, "card fits the iPhone width");
  // 📅 Finish dates calendar (plan item 20): opens to this month; ZZ00003 (due in 6 days) is on its day; a tap lists it.
  const cal = page.locator('[data-hpd-smoke="home-finish-cal"]');
  await cal.locator('[data-hpd-smoke="home-finish-cal-toggle"]').click();
  const iso = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (iso(6).slice(0, 7) !== iso(0).slice(0, 7)) await cal.locator('[data-hpd-smoke="home-finish-cal-next"]').click();
  const cell = cal.locator(`[data-hpd-smoke="home-finish-cal-day"][data-day="${iso(6)}"]`);
  assert.equal(await cell.getAttribute("data-count"), "1");
  await cell.click();
  const jobs = await cal.locator('[data-hpd-smoke="home-finish-cal-job"]').allInnerTexts();
  assert.deepEqual(jobs.map((t) => t.replace(/\s*›$/, "")), ["ZZ00003: 6 days left"]);
  assert.equal(await cal.locator('[data-hpd-smoke="home-finish-cal-job"]').getAttribute("href"), "/map/?omo=ZZ00003");
  const calBox = await cal.boundingBox();
  assert.ok(calBox && calBox.width <= 390, `calendar fits the iPhone width (${calBox?.width})`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), "no sideways scroll");
  // Tapping 🗺 opens Plan my day with just ZZ00002 then ZZ00003 (no other job, no location asked).
  await routeBtn.click();
  await page.waitForURL(/\/map\/\?route=/);
  const stops = page.locator(".plan-my-day__results article strong");
  await stops.first().waitFor({ timeout: 20000 });
  assert.deepEqual(await stops.allInnerTexts(), ["ZZ00002", "ZZ00003"]);
  assert.match(await page.locator(".plan-my-day__results").innerText(), /Due in 1 day \(HPD finish date\)/);
  console.log("award-countdown browser test passed");
} finally {
  await browser.close();
}
