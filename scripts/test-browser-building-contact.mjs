// 📞 Tap to call the super (idea list): save the building's contact on one job's card; another job at the same building
// shows it with Call (tel:) and Text (sms:); change and remove work; kept on this phone only (localStorage), nothing sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const { buildingKey } = await loadLib("building-history");
const jobs = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
const by = new Map();
for (const j of jobs) { if (!j.OMO || !j.BuildingAddress) continue; const k = buildingKey(j.BuildingAddress); by.set(k, [...(by.get(k) || []), j.OMO]); }
const pair = [...by.values()].find((ids) => ids.length >= 2);
assert.ok(pair, "two jobs at one building");
const [a, b] = pair;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posts = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") posts.push(r.request().postData() || ""); return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const open = async (id) => { await page.goto(`${baseUrl}/map/?omo=${id}&view=all`, { waitUntil: "load", timeout: 180000 }); await page.locator("#fc-job-card").waitFor({ timeout: 60000 }); };
  await open(a);
  const box = page.locator('[data-hpd-smoke="jc-building-contact"]');
  await box.waitFor({ timeout: 20000 });
  await box.locator('[data-hpd-smoke="jc-bc-add"]').click();
  await box.locator('[data-hpd-smoke="jc-bc-phone"]').fill("12345");
  await box.locator('[data-hpd-smoke="jc-bc-save"]').click();
  assert.match(await box.locator('[data-hpd-smoke="jc-bc-msg"]').innerText(), /10-digit/);
  await box.locator('[data-hpd-smoke="jc-bc-name"]').fill("Super Jose");
  await box.locator('[data-hpd-smoke="jc-bc-phone"]').fill("(212) 555-0147");
  await box.locator('[data-hpd-smoke="jc-bc-note"]').fill("basement door");
  await box.locator('[data-hpd-smoke="jc-bc-save"]').click();
  assert.match(await box.innerText(), /🏢 Super Jose · \(212\) 555-0147 · basement door/);
  // Another job at the same building.
  await open(b);
  const box2 = page.locator('[data-hpd-smoke="jc-building-contact"]');
  await box2.waitFor({ timeout: 20000 });
  assert.match(await box2.innerText(), /Super Jose · \(212\) 555-0147/);
  assert.equal(await box2.locator('[data-hpd-smoke="jc-bc-call"]').getAttribute("href"), "tel:2125550147");
  assert.equal(await box2.locator('[data-hpd-smoke="jc-bc-text"]').getAttribute("href"), "sms:2125550147");
  await box2.locator('[data-hpd-smoke="jc-bc-edit"]').click();
  await box2.locator('[data-hpd-smoke="jc-bc-remove"]').click();
  assert.match(await box2.innerText(), /Save the super \/ building contact/);
  assert.ok(!posts.some((p) => /555-?0147|2125550147/.test(p)), "the phone never goes to the status server");
  assert.deepEqual(errors, []);
  console.log(`PASS building contact: saved on ${a}, shown on ${b} (same building) with Call / Text; change / remove; kept on the phone only`);
} finally {
  await browser.close();
}
