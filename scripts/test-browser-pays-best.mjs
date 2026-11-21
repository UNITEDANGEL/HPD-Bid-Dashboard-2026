// 📊 "Which work pays best" card on the Home screen (plan, 20 Nov): kinds of work ranked by money per work day.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const job = (OMO, JobDescription, AwardAmount, s, e) => ({ OMO, JobDescription, AwardAmount, WorkStartDate: s, WorkCompletionDate: e, AwardDate: "01/05/26" });
  await page.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: [
    job("P1", "PAINT WALLS", "1000", "1/5/26", "1/6/26"), job("P2", "PLASTER CEILING", "600", "1/5/26", "1/5/26"),
    job("D1", "FIX DOOR", "500", "1/5/26", "1/9/26"), job("D2", "DOOR LOCK", "300", "1/5/26", "1/5/26"),
  ] }));
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const card = page.locator('[data-hpd-smoke="home-pays-best"]');
  await card.waitFor({ timeout: 10000 });
  const rows = await card.locator('[data-hpd-smoke="home-pays-best-row"]').allInnerTexts();
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Plaster \/ paint: \$533 a work day/);
  assert.match(rows[1], /Doors \/ locks: \$133 a work day/);
  assert.match(await card.innerText(), /from 4 past HPD jobs/);
  console.log("pays-best browser test passed");
} finally {
  await browser.close();
}
