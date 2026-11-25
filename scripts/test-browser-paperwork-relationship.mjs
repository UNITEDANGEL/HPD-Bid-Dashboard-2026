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
  // 25 Nov (ER00332): out in the open, no folded box to open first.
  assert.ok(await more.isVisible(), "who refused shows without opening anything");
  const chips = more.locator('[data-hpd-smoke="paperwork-rel-chips"] button');
  assert.ok((await chips.count()) >= 5, "choices to tap");
  const input = more.locator('[data-hpd-smoke="paperwork-refused-relationship"]');
  const name = more.locator('[data-hpd-smoke="paperwork-refused-name"]');
  const phone = more.locator('[data-hpd-smoke="paperwork-refused-phone"]');
  // The super's name / phone filled in go away when someone else refused; a phone typed for the tenant sticks.
  await chips.filter({ hasText: "SUPER" }).click();
  await name.fill("JOHN SUPER");
  await phone.fill("718-555-0199");
  await chips.filter({ hasText: "TENANT" }).first().click();
  assert.equal(await name.inputValue(), "", "super's name cleared for a tenant");
  assert.equal(await phone.inputValue(), "", "super's phone cleared for a tenant");
  await phone.fill("718-555-0100");
  assert.equal(await phone.inputValue(), "718-555-0100", "tenant's phone sticks");
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
