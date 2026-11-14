// 📅 "This month at a glance" card on the Home screen (idea, 14 Nov): jobs sent, money paid and still waiting.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }).slice(0, 7);
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { A: { sentAt: `${month}-02` }, B: { sentAt: `${month}-03` }, C: { sentAt: "2020-01-01" } } } }));
  await page.route("**/data/pip_paid.json*", (r) => r.fulfill({ json: { jobs: { A: { status: "not paid yet", outstanding: 400 }, B: { status: "paid", outstanding: 0 } } } }));
  await page.route("**/data/pip_payments.json*", (r) => r.fulfill({ json: { generatedAt: "2026-11-10T00:00:00Z", totals: { disbursed: 500, count: 1, staleCount: 0, stale: 0, disbursedCount: 1 }, byMonth: { [month]: 1234 } } }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-month"]');
  await card.waitFor({ timeout: 10000 });
  const text = await card.innerText();
  assert.match(text, /2 jobs sent to HPD/);
  assert.match(text, /\$1,234 paid/);
  assert.match(text, /\$400 still waiting/);
  assert.match(text, /\$500 on the way/);
  console.log("month-glance browser test passed");
} finally {
  await browser.close();
}
