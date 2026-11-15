// Stop double sends (owner idea, 14 Nov): a package built for a job already emailed to HPD shows a yellow warning
// with the date; a job never sent shows none. The status server and sent list are faked; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function run(job, sent) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route("**/data/sent_paperwork.json", (r) => r.fulfill({ json: { jobs: sent } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/paperwork?job=${job}&outcome=work_completed`, { waitUntil: "networkidle" });
  await page.locator('[data-hpd-smoke="paperwork-generate-print"]').click();
  await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 90000 });
  const warn = page.locator('[data-hpd-smoke="paperwork-already-sent"]');
  const text = (await warn.count()) ? await warn.innerText() : "";
  assert.deepEqual(errors, []);
  await context.close();
  return text;
}
try {
  const t = await run("ER05729", { ER05729: { sentAt: "2026-10-22", count: 2 } });
  assert.match(t, /ER05729 was already sent to HPD on 10\/22\/26 \(2 times\)/);
  assert.equal(await run("ER05729", {}), "", "no warning when it was never sent");
  console.log("already-sent warning: ok");
} finally { await browser.close(); }
