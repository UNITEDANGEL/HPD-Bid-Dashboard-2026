// 👷 Send a job to a worker (idea list): the job card's button opens the share sheet (faked) with the job number, the
// address, the work, the photos HPD still needs, the super saved for the building and the map link; no tenant name or
// phone unless "add the tenant's name and phone" is ticked. Nothing is sent by the app.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const { buildingKey } = await loadLib("building-history");
const JOB = "EQ15239";
const job = (await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json()).find((j) => j.OMO === JOB);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript((k) => {
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    localStorage.setItem("hpd-building-contacts", JSON.stringify({ [k]: { name: "Super Jose", phone: "2125550147", note: "basement door", savedAt: "2026-11-08T12:00:00Z" } }));
  }, buildingKey(job.BuildingAddress));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  const tenantPhone = ((await page.locator('[data-hpd-smoke="jc-tenant-call"]').getAttribute("href").catch(() => "")) || "").replace(/^tel:/, "").replace(/\D/g, "").slice(-10);
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const t1 = await page.evaluate(() => window.__shared.text);
  assert.match(t1, new RegExp(`^HPD job ${JOB}\\n📍 1207 1 AVENUE`));
  assert.match(t1, /\nThe work:\n• /);
  assert.match(t1, /📸 Photos HPD needs: before photos, before video, after photos, after video\./);
  assert.match(t1, /🏢 Building: Super Jose \(212\) 555-0147 \(basement door\)/);
  assert.match(t1, /Map: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.ok(!/Tenant:/.test(t1) && (!tenantPhone || !t1.replace(/\D/g, "").includes(tenantPhone)), "no tenant unless ticked");
  assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /Sent to your worker/);
  // With the tenant ticked.
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('[data-hpd-smoke="jc-crew-tenant"]').check();
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const t2 = await page.evaluate(() => window.__shared.text);
  if (tenantPhone) assert.ok(t2.replace(/\D/g, "").includes(tenantPhone), "tenant phone when ticked");
  assert.match(t2, /🔔 Tenant: /);
  assert.deepEqual(errors, []);
  console.log("PASS crew share: job, address, the work, photos still needed, the super, map link; the tenant only when ticked");
} finally {
  await browser.close();
}
