// A heads-up before the weather turns (27 Oct, "the AI should figure it out by itself") at iPhone size: at 10 AM New
// York time, rain at 1 PM (faked forecast) and today's route has a roof job -> one "🌧 Rain at 1 PM · outside work at
// <address>" alert that opens that job; it isn't repeated the same day; a dry day stays quiet.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
// A job of ours with roof work and a place on the map.
const coa = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
const rows = Array.isArray(coa) ? coa : coa.jobs || coa.rows || Object.values(coa)[0];
const roof = rows.find((j) => /\broof\b/i.test(`${j.JobDescription || ""} ${j.description || ""} ${j.Job_Description || ""}`) && Number(j.Latitude) > 40 && /^E[A-Z]\d{5}$/.test(j.OMO));
assert.ok(roof, "a roof job in the data");

async function open(wet) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const time = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00`);
  const rain = (h) => wet && h >= 13 && h < 16;
  await c.route(/api\.open-meteo\.com/, (r) => r.fulfill({ json: { hourly: { time, temperature_2m: time.map(() => 58), precipitation_probability: time.map((_, h) => (rain(h) ? 80 : 5)), precipitation: time.map((_, h) => (rain(h) ? 0.2 : 0)), weathercode: time.map((_, h) => (rain(h) ? 63 : 3)), windspeed_10m: time.map(() => 8) }, daily: { time: [day], temperature_2m_max: [62], temperature_2m_min: [54], precipitation_probability_max: [wet ? 80 : 5], weathercode: [wet ? 63 : 3], sunrise: [`${day}T07:20`], sunset: [`${day}T18:00`], windspeed_10m_max: [9] } } }));
  await c.addInitScript(([d, id]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: d, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: [id] })); sessionStorage.setItem("seeded", "1"); } }, [day, roof.OMO]);
  const page = await c.newPage();
  // 10 AM in New York (EDT / EST either way is within work hours).
  await page.clock.install({ time: new Date(`${day}T14:30:00Z`) });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  return { c, page, errors };
}
try {
  // 1. Rain at 1 PM, roof job on the route: the alert (other alerts may come first: clear them).
  {
    const { c, page, errors } = await open(true);
    const ping = page.locator('[data-hpd-smoke="fc-hpd-ping"][data-kind="weather"]');
    await page.waitForFunction(() => Boolean(localStorage.getItem("hpd-wx-alert")), null, { timeout: 45000 });
    for (let i = 0; i < 8 && !(await ping.count()); i++) {
      while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
      await page.waitForTimeout(1000);
    }
    const shown = await ping.count() ? await ping.innerText() : "";
    // Covered by an HPD alert? It's still in the 🔔 list.
    const logged = await page.evaluate(() => localStorage.getItem("hpd-notifications-v1") || "");
    assert.ok(/Rain at 1 PM · outside work at/.test(shown) || /Rain at 1 PM · outside work at/.test(logged), `alert shown or logged: ${shown.slice(0, 80)}`);
    assert.equal(await page.evaluate(() => localStorage.getItem("hpd-wx-alert")), day, "once a day");
    if (shown) {
      assert.match(shown, /Do the roof and outside jobs first/);
      await ping.locator(".fc-hpd-ping-main").click();
      await page.locator("#fc-job-card").waitFor({ timeout: 15000 });
      assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(roof.OMO));
    }
    // Opening again the same day: no second alert.
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(5000);
    assert.equal(await page.locator('[data-hpd-smoke="fc-hpd-ping"][data-kind="weather"]').count(), 0, "not repeated");
    assert.deepEqual(errors, []);
    await c.close();
  }
  // 2. A dry day: quiet.
  {
    const { c, page } = await open(false);
    await page.waitForTimeout(5000);
    assert.equal(await page.locator('[data-hpd-smoke="fc-hpd-ping"][data-kind="weather"]').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("hpd-wx-alert")), null);
    await c.close();
  }
  console.log(`PASS weather heads-up: rain at 1 PM + roof job ${roof.OMO} on today's route -> "🌧 Rain at 1 PM · outside work at …", opens the job, once a day; a dry day stays quiet`);
} finally {
  await browser.close();
}
