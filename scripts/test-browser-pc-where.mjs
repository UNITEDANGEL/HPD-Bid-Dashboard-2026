// 💻 On the computer (owner, 6 Nov: "I'm on my computer, I can't see my location"): a desktop with no location says
// "Computer: no GPS" and where the phone has you working (the 🔨 job from the phone), and one tap opens that job.
// On a phone the old warning stays. "⚠ jobs need a check" folds behind the ✉ side button.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const JOB = "ER02330";
try {
  const run = async (mobile) => {
    const c = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", serviceWorkers: "block" }
      : { viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await c.addInitScript((job) => {
      // No location here (a PC has no GPS), and the phone saved an arrival at the job 40 minutes ago.
      Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_ok, no) => setTimeout(() => no({ code: 2, message: "no fix" }), 10), watchPosition: (_ok, no) => { setTimeout(() => no({ code: 2, message: "no fix" }), 10); return 1; }, clearWatch: () => {} } });
      if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [job]: { FieldArrivedAt: new Date(Date.now() - 40 * 60000).toISOString() } })); sessionStorage.setItem("seeded", "1"); }
    }, JOB);
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('button[aria-label="Locate me"]').click();
    return { c, page, errors };
  };

  // Computer.
  const pc = await run(false);
  const where = pc.page.locator('[data-hpd-smoke="fc-pc-where"]');
  await where.waitFor({ timeout: 10000 });
  assert.match(await where.innerText(), new RegExp(`Computer: no GPS · 📱 phone has you at ${JOB}`));
  assert.equal(await pc.page.getByText("Couldn't get your location").count(), 0);
  await where.click();
  await pc.page.locator("#fc-job-card").waitFor({ timeout: 10000 });
  assert.match(await pc.page.locator("#fc-job-card").innerText(), new RegExp(JOB));
  assert.deepEqual(pc.errors, []);
  await pc.c.close();

  // Phone: the warning stays, no "Computer" line.
  const ph = await run(true);
  await ph.page.getByText("Couldn't get your location").first().waitFor({ timeout: 10000 });
  assert.equal(await ph.page.locator('[data-hpd-smoke="fc-pc-where"]').count(), 0);
  // The check card is behind the side button: closed side -> hidden.
  await ph.page.evaluate(() => { localStorage.setItem("hpd-side-open", "0"); });
  await ph.page.reload({ waitUntil: "load" });
  await ph.page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await ph.page.waitForTimeout(1500);
  assert.equal(await ph.page.locator('[data-hpd-smoke="fc-data-check"]').count(), 0, "check card folded behind the side button");
  assert.deepEqual(ph.errors, []);
  await ph.c.close();
  console.log("PASS computer: no GPS says where the phone has you working and opens that job; phone keeps the warning; check card folds away");
} finally {
  await browser.close();
}
