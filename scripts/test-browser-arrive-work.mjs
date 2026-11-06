// 📍 -> 📄 At the job (owner, 6 Nov: "I'm at ER07610 ... you already know I have arrived, look at my location ... then
// confirm with me ... it should automatically open the invitation to bid, scroll very nice and slowly to the work
// description, read it out loud"): standing at a job that isn't on Today's route still asks "Have you arrived?";
// Yes saves the arrival and opens HPD's work order on the work description, read out loud; Start the work goes on.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const JOB = "ER07610";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", geolocation: { latitude: 40.683503, longitude: -73.871985, accuracy: 15 }, permissions: ["geolocation"] });
  await routePrivate(c);
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") posted.push(r.request().postData() || ""); return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  const ask = page.locator('[data-hpd-smoke="fc-arrive"]');
  await ask.waitFor({ timeout: 60000 });
  assert.match(await ask.innerText(), /ER07610 · \d+ ft away\. Have you arrived\?/);
  await page.locator('[data-hpd-smoke="fc-arrive-yes"]').click();
  const wo = page.locator('[data-hpd-smoke="fc-work-order"]');
  await wo.waitFor({ timeout: 15000 });
  assert.match(await wo.innerText(), /3346 FULTON STREET/);
  assert.ok((await page.locator('[data-hpd-smoke="fc-work-order-words"]').innerText()).length > 20, "the work, in words");
  await page.waitForFunction((j) => (window.__said || []).some((t) => t.includes("Work order") && t.includes(j.split("").join(" "))), JOB, { timeout: 15000 });
  for (let i = 0; i < 20 && !posted.join("").includes(JOB); i++) await page.waitForTimeout(250);
  assert.ok(posted.join("").includes(JOB) && /Arrived/.test(posted.join("")), "the arrival is saved");
  await page.locator('[data-hpd-smoke="fc-work-order-start"]').click();
  await wo.waitFor({ state: "detached", timeout: 5000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 10000 });

  assert.deepEqual(errors, []);
  console.log("PASS at the job: asked without a route, Yes saves the arrival, opens the work order read out loud, Start the work goes on");
} finally {
  await browser.close();
}
