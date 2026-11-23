// 🏆 "Your week" card on the Home screen (idea, 14 Nov): sent, won, money in, with a trophy on a good week.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const weekAgo = new Date(new Date(`${today}T12:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const jobs = { ...Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`J${i}`, { sentAt: today }])), ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [`L${i}`, { sentAt: weekAgo }])) };
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs } }));
  await page.route("**/data/pip_payments.json*", (r) => r.fulfill({ json: { generatedAt: "2026-11-10T00:00:00Z", totals: { disbursed: 0, count: 1, staleCount: 0, stale: 0, disbursedCount: 0 }, byMonth: {}, recent: [{ date: today, status: "Paid", amount: 2500, id: "x" }] } }));
  await page.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: [] }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-week"]');
  await card.waitFor({ timeout: 10000 });
  const text = await card.innerText();
  assert.match(text, /5 sent/);
  assert.match(text, /\$2,500 in/);
  assert.match(text, /🏆/);
  // This week vs last week: 5 sent now vs 7 the same day last week (down), $2,500 vs $0 (up).
  assert.match(text, /Same days last week: 7 sent/);
  const trends = await card.locator('[data-hpd-smoke="home-week-arrow"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-trend")));
  assert.deepEqual(trends, ["down", "same", "up"]);
  assert.equal(await page.locator('[data-hpd-smoke="home-week-ontime"]').count(), 0); // no finish dates on file: no line
  // 📊 On time vs late (plan item 27): J1-J2 sent by HPD's finish date, J3 after it; L1 last week late.
  const page2 = await c.newPage();
  const later = new Date(new Date(`${today}T12:00:00Z`).getTime() + 5 * 86400000).toISOString().slice(0, 10);
  const earlier = new Date(new Date(`${today}T12:00:00Z`).getTime() - 30 * 86400000).toISOString().slice(0, 10);
  await page2.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs } }));
  await page2.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: [
    { OMO: "J1", AwardDate: earlier, WorkCompletionDate: later }, { OMO: "J2", AwardDate: earlier, WorkCompletionDate: today },
    { OMO: "J3", AwardDate: earlier, WorkCompletionDate: earlier }, { OMO: "L1", AwardDate: earlier, WorkCompletionDate: earlier },
  ] }));
  await page2.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const ot = page2.locator('[data-hpd-smoke="home-week-ontime"]');
  await ot.waitFor({ timeout: 10000 });
  const otText = await ot.innerText();
  assert.match(otText, /2 on time · ⏰ 1 late this week/);
  assert.match(otText, /Last week \(same days\): 0 on time · 1 late/);
  console.log("week-score browser test passed");
} finally {
  await browser.close();
}
