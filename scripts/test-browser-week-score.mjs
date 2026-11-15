// 🏆 "Your week" card on the Home screen (idea, 14 Nov): sent, won, money in, with a trophy on a good week.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const jobs = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`J${i}`, { sentAt: today }]));
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs } }));
  await page.route("**/data/pip_payments.json*", (r) => r.fulfill({ json: { generatedAt: "2026-11-10T00:00:00Z", totals: { disbursed: 0, count: 1, staleCount: 0, stale: 0, disbursedCount: 0 }, byMonth: {}, recent: [{ date: today, status: "Paid", amount: 2500, id: "x" }] } }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-week"]');
  await card.waitFor({ timeout: 10000 });
  const text = await card.innerText();
  assert.match(text, /5 sent/);
  assert.match(text, /\$2,500 in/);
  assert.match(text, /🏆/);
  console.log("week-score browser test passed");
} finally {
  await browser.close();
}
