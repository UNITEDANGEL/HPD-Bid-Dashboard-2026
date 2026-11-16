// 💵 "Where is my money?" card on the Home screen (idea, 14 Nov): unpaid sent jobs with days waiting.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  // Calendar days back from New York's today (n x 24 h crosses a clock change: late at night 40 days read as 39).
  const ago = (n) => { const t = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { A: { sentAt: ago(40) }, B: { sentAt: ago(5) } } } }));
  await page.route("**/data/pip_paid.json*", (r) => r.fulfill({ json: { jobs: { A: { status: "not paid yet", outstanding: 400 }, B: { status: "partly paid", outstanding: 100 } } } }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-owed"]');
  await card.waitFor({ timeout: 10000 });
  const text = await card.innerText();
  assert.match(text, /\$500 waiting on 2 jobs/);
  assert.match(text, /A: \$400 · 40 days/);
  assert.match(text, /B: \$100 · 5 days/);
  assert.ok(text.includes("A (40 days)"));
  console.log("who-owes browser test passed");
} finally {
  await browser.close();
}
