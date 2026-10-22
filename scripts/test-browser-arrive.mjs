// Arriving at a route stop (owner, 22 Oct: "even if I use Google or Waze it should know I arrived, or ask me 'have you
// arrived?', then we start the job") and the job first on the card ("the job description very nice and clear on top,
// with a summary"), at iPhone size on real data: a job from the To do list is today's route stop and the phone stands
// ~110 ft from it (map open, no card) -> "📍 You're at <address> · Have you arrived?" -> Yes opens the job with the
// arrival saved; it doesn't ask again. The card starts with "📋 The job" above HPD's full text.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const data = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
  const rows = Array.isArray(data) ? data : data.jobs || [];
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", geolocation: { latitude: 40.7128, longitude: -74.006, accuracy: 20 }, permissions: ["geolocation"] });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  // A job on the To do list with a location.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  const stop = ids.map((id) => rows.find((j) => j.OMO === id)).find((j) => j && Number(j.Latitude) && Number(j.Longitude) && String(j.JobDescription || j.ItbPage3Description || "").length > 60);
  assert.ok(stop, "a to-do job with a location");
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  // It's today's route stop, and the phone is ~110 ft from it.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  await page.evaluate(({ id, today }) => localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: [id] })), { id: stop.OMO, today });
  await c.setGeolocation({ latitude: Number(stop.Latitude) + 0.0003, longitude: Number(stop.Longitude), accuracy: 20 });
  await page.reload({ waitUntil: "load" });
  const ask = page.locator('[data-hpd-smoke="fc-arrive"]');
  await ask.waitFor({ timeout: 60000 });
  assert.match(await ask.innerText(), new RegExp(`${stop.OMO} · \\d+ ft away\\. Have you arrived\\?`));
  if (shots) await page.screenshot({ path: `${shots}/arrive-ask.png` });
  await ask.locator('[data-hpd-smoke="fc-arrive-yes"]').click();
  const card = page.locator("#fc-job-card");
  await card.waitFor({ timeout: 20000 });
  assert.match(await card.innerText(), new RegExp(stop.OMO));
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="jc-step-arrived"]'), null, { timeout: 15000 });
  // The job first: plain lines above HPD's full text.
  const sum = card.locator('[data-hpd-smoke="jc-job-sum"]');
  await sum.waitFor();
  assert.ok((await sum.locator("li").count()) >= 1, "at least one plain line");
  const [sumTop, textTop] = await Promise.all([sum.boundingBox(), card.locator('[data-hpd-smoke="jc-description-text"]').boundingBox()]);
  assert.ok(sumTop.y < textTop.y, "the summary is above HPD's text");
  if (shots) { await sum.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${shots}/arrive-card.png` }); }
  const sumText = (await sum.innerText()).replace(/\s+/g, " ");
  // Closed: it doesn't ask again for this job.
  await page.locator(".fc-job-sheet-close").click();
  await page.waitForTimeout(1500);
  assert.equal(await ask.count(), 0, "asks once");
  assert.deepEqual(errors, []);
  console.log(`PASS arrive: at ${stop.OMO} (route stop) -> "Have you arrived?" -> Yes opened the job with the arrival saved; card starts with "${sumText.slice(0, 80)}" above HPD's text`);
  await c.close();
} finally {
  await browser.close();
}
