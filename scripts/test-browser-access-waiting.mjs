// 🚪 "Jobs waiting on access" card on the Home screen (idea, 14 Nov): jobs with no-access tries, with each try's date.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  await page.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { C3: { sentAt: "2026-11-09" } } } }));
  await page.addInitScript(() => {
    localStorage.setItem("hpd-job-notes", JSON.stringify({
      A1: [{ text: "No access proof: Nov 3, 10:00 AM, 1 door photo, 0 call tries.", at: "2026-11-03T15:00:00Z" }, { text: "No access proof: Nov 7, 9:00 AM, no door photo, 1 call try.", at: "2026-11-07T15:00:00Z" }],
      B2: [{ text: "No access proof: Nov 5, 9:00 AM, no door photo, 0 call tries.", at: "2026-11-05T15:00:00Z" }],
      C3: [{ text: "No access proof: Nov 1, 9:00 AM", at: "2026-11-01T15:00:00Z" }],
    }));
  });
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-no-access"]');
  await card.waitFor({ timeout: 10000 });
  const text = await card.innerText();
  assert.match(text, /2 jobs where nobody let you in/);
  assert.match(text, /A1: 2 tries · Nov 3 · Nov 7 · ready for the no-access paperwork/);
  assert.match(text, /B2: 1 try · Nov 5/);
  assert.doesNotMatch(text, /C3/);
  console.log("access-waiting browser test passed");
} finally {
  await browser.close();
}
