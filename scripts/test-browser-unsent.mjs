// ☁️ Not sent yet (owner, 18 Nov "do all"): a job change saved on the phone that the status server hasn't got shows
// on the map as "☁️ 1 job change not sent yet · Send now"; with the server back, Send now sends it and says ✓ All sent.
// The status server is faked here (never the real one): it answers 503 until the test lets it through.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  let serverUp = false;
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") {
      if (!serverUp) return r.fulfill({ status: 503, json: { ok: false } });
      posted.push(r.request().url());
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
  await c.addInitScript((at) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ "TEST-UNSENT-1": { FieldOutcome: "WORK_COMPLETED", updatedAt: at } }));
    localStorage.setItem("hpd-override-outbox-v1", JSON.stringify({ "TEST-UNSENT-1": at }));
    sessionStorage.setItem("seeded", "1");
  }, tenMinAgo);
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  const chip = page.locator('[data-hpd-smoke="fc-unsent"]');
  await chip.waitFor({ timeout: 20000 });
  assert.match(await chip.innerText(), /^☁️ 1 job change not sent yet · Send now$/);
  // Still no signal: it says so and keeps the change.
  await chip.click();
  await page.waitForFunction(() => /still not sent/.test(document.querySelector('[data-hpd-smoke="fc-unsent"]')?.textContent || ""), null, { timeout: 10000 });
  assert.ok(await page.evaluate(() => "TEST-UNSENT-1" in JSON.parse(localStorage.getItem("hpd-override-outbox-v1") || "{}")), "kept while not sent");
  // Server back: Send now sends it.
  serverUp = true;
  await page.waitForTimeout(6500);
  // (The app also retries by itself; if that already sent it, the chip is gone.)
  if (await chip.isVisible()) {
    await chip.click();
    await page.waitForFunction(() => /✓ All sent/.test(document.querySelector('[data-hpd-smoke="fc-unsent"]')?.textContent || "") || !document.querySelector('[data-hpd-smoke="fc-unsent"]'), null, { timeout: 10000 });
  }
  assert.ok(posted.some((u) => /\/override$/.test(u)), "sent to the (fake) status server");
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("hpd-override-outbox-v1") || "{}")).length), 0, "nothing waiting");
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-unsent"]'), null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log("PASS not sent yet: a job change the server hasn't got shows ☁️ 1 not sent yet; no signal keeps it; Send now sends it, ✓ All sent, then gone");
} finally {
  await browser.close();
}
