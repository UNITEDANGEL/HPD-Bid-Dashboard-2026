// Browser smoke test: the Refused Access and Done by others forms must have a date you can change.
// Needs the app running. BASE_URL defaults to http://localhost:3000. Nothing is saved or sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [outcome, smoke] of [["refused_access", "paperwork-refused-date"], ["completed_by_others", "paperwork-by-others-date"]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (route) => route.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${baseUrl}/paperwork?job=ER05729&outcome=${outcome}`, { waitUntil: "networkidle" });
    const input = page.locator(`[data-hpd-smoke="${smoke}"]`);
    await input.waitFor({ timeout: 15000 });
    assert.equal(await input.isDisabled(), false, `${outcome}: date must be editable`);
    await input.fill("2026-10-05");
    assert.equal(await input.inputValue(), "2026-10-05", `${outcome}: date change must stick`);
    assert.deepEqual(errors, [], `${outcome}: no page errors`);
    await context.close();
  }
  console.log("paperwork refused/by-others date test passed");
} finally {
  await browser.close();
}
