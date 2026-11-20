// The refused-access form lets the owner change who refused (owner, 20 Nov: super -> attendant, tenant named as refused):
// one-tap choices and free typing both stick. Nothing is saved or sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (route) => route.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${baseUrl}/paperwork?job=ER05729&outcome=refused_access`, { waitUntil: "networkidle" });
  const more = page.locator('[data-hpd-smoke="paperwork-refused-more"]');
  await more.waitFor({ timeout: 15000 });
  await more.locator("summary").click();
  const chips = more.locator('[data-hpd-smoke="paperwork-rel-chips"] button');
  assert.ok((await chips.count()) >= 5, "choices to tap");
  const input = more.locator("input").nth(1);
  await chips.filter({ hasText: "ATTENDANT" }).click();
  assert.equal(await input.inputValue(), "ATTENDANT", "super -> attendant");
  await chips.filter({ hasText: "TENANT" }).first().click();
  assert.equal(await input.inputValue(), "TENANT", "tenant as the refused person");
  await input.fill("HOME HEALTH AIDE");
  assert.equal(await input.inputValue(), "HOME HEALTH AIDE", "any words stick");
  assert.deepEqual(errors, []);
  console.log("paperwork relationship test passed");
} finally {
  await browser.close();
}
