// 🚪 Before you leave (owner idea, 24 Nov: "AI checks photos before you leave"): on a job that was worked on with no
// photos yet, ✕ I left first shows "Before you leave" with the missing before / after photos; 📷 Take it now opens the
// job card on the photo buttons; Leave anyway ends "Working at". iPhone size, nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route("**/api/drive/**", (r) => r.fulfill({ json: {} }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settle = async () => {
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('[data-hpd-smoke="fc-newupdate-ok"]').click({ timeout: 3000 }).catch(() => {});
  };
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await settle();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const HERE = await page.locator('[data-hpd-smoke="fc-jobs-row"]').first().getAttribute("data-omo");
  assert.ok(HERE, "a job in the list");
  await page.evaluate(({ HERE }) => {
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [HERE]: { FieldArrivedAt: new Date(Date.now() - 30 * 60000).toISOString(), FieldOutcome: "WORK_STARTED" } }));
  }, { HERE });
  await page.reload({ waitUntil: "load" });
  await settle();
  const bar = page.locator('[data-hpd-smoke="fc-onsite"]');
  await bar.waitFor({ timeout: 20000 });
  assert.match(await bar.innerText(), new RegExp(HERE));

  // ✕ I left -> Before you leave, with both photos missing.
  await page.locator('[data-hpd-smoke="fc-onsite-left"]').click();
  const box = page.locator('[data-hpd-smoke="fc-leave-check"][data-ready="true"]');
  await box.waitFor({ timeout: 20000 });
  const text = await box.innerText();
  assert.match(text, new RegExp(`Before you leave ${HERE}`));
  assert.match(text, /No before photo yet/);
  assert.match(text, /No after photo yet/);
  const r = await box.boundingBox();
  assert.ok(r && r.x >= 0 && r.x + r.width <= 390, "fits the iPhone");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/leave-check.png` }).catch(() => {});

  // 📷 Take it now -> the job card opens on the photo buttons.
  await page.locator('[data-hpd-smoke="fc-leave-take"]').click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  await page.locator(".fc-photo-source-actions").first().waitFor({ timeout: 10000 });
  await page.locator(".fc-job-sheet-close").click();

  // Still working there; ✕ I left again -> Leave anyway ends "Working at".
  await bar.waitFor({ timeout: 20000 });
  await page.locator('[data-hpd-smoke="fc-onsite-left"]').click();
  await box.waitFor({ timeout: 20000 });
  await page.locator('[data-hpd-smoke="fc-leave-anyway"]').click();
  await bar.waitFor({ state: "detached", timeout: 10000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-leave-check"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS before you leave: ${HERE} missing photos shown, Take it now opens the photo buttons, Leave anyway ends Working at`);
} finally {
  await browser.close();
}
