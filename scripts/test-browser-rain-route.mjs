// 🌧 Rain check on the route (idea list) at iPhone size, Monday Nov 9, the forecast faked (rain from 10 AM): a route
// with two inside jobs and an outside one (bulkhead / yard / roof…) last -> "🌧 Rain 10 AM-8 PM … Outside work in it: …
// Do it first, before it starts." -> ☔ Outside work first moves it to stop 1 -> the calm line. No real weather call.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const D = "2026-11-09";
const { outsideWord } = await loadLib("rain-route");
const data = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
const outsideIds = new Set(data.filter((x) => outsideWord(`${x.ItbPage3Description || ""} ${x.JobDescription || ""}`)).map((x) => x.OMO));
const hours = Array.from({ length: 72 }, (_, i) => { const d = new Date(Date.UTC(2026, 10, 9 + Math.floor(i / 24))); return `${d.toISOString().slice(0, 10)}T${String(i % 24).padStart(2, "0")}:00`; });
const wet = (t) => t.startsWith(D) && Number(t.slice(11, 13)) >= 10;
const meteo = { hourly: { time: hours, temperature_2m: hours.map(() => 48), precipitation_probability: hours.map((t) => (wet(t) ? 85 : 5)), precipitation: hours.map((t) => (wet(t) ? 0.12 : 0)), weathercode: hours.map((t) => (wet(t) ? 63 : 2)), windspeed_10m: hours.map(() => 6) },
  daily: { time: [D, "2026-11-10", "2026-11-11"], temperature_2m_max: [50, 52, 54], temperature_2m_min: [40, 41, 42], precipitation_probability_max: [85, 10, 10], weathercode: [63, 2, 2], sunrise: [`${D}T06:35`, "2026-11-10T06:36", "2026-11-11T06:37"], sunset: [`${D}T16:40`, "2026-11-10T16:39", "2026-11-11T16:38"], windspeed_10m_max: [10, 8, 8] } };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.route(/api\.open-meteo\.com/, (r) => r.fulfill({ json: meteo }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date(`${D}T12:30:00Z`) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const open = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  const out = open.find((id) => outsideIds.has(id));
  const inside = open.filter((id) => !outsideIds.has(id)).slice(0, 2);
  assert.ok(out && inside.length === 2, `an outside job among the open ones (${outsideIds.size} outside in all)`);
  await page.evaluate(({ ids, D }) => {
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: D, start: "08:00", end: "17:00", minutes: 60, borough: "ALL" }, ids, origin: { point: { lat: 40.7128, lng: -73.95 }, label: "office" } }));
    sessionStorage.removeItem("hpd-weather");
  }, { ids: [...inside, out], D });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').click(); await page.locator('[data-hpd-smoke="fc-route-open"]').click();
  const rain = page.locator('[data-hpd-smoke="fc-route-rain"]');
  await rain.waitFor({ timeout: 20000 });
  const t1 = await rain.textContent();
  assert.match(t1, /^🌧 Rain 10 AM-8 PM \(85%\)\. Outside work in it: .+\(\w[\w ]*\)\. Do it first, before it starts\./, t1);
  assert.ok(await rain.evaluate((e) => e.classList.contains("is-wet")));
  await page.locator('[data-hpd-smoke="fc-route-rain-fix"]').click();
  await page.waitForFunction((out) => (document.querySelector(".fc-route-stop")?.textContent || "").includes(out), out, { timeout: 8000 });
  const t2 = await rain.textContent();
  assert.match(t2, /^🌧 Rain 10 AM-8 PM \(85%\)\. Your outside work \(.+\) is planned before or after it\.$/, t2);
  assert.equal(await page.locator('[data-hpd-smoke="fc-route-rain-fix"]').count(), 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1")).ids[0]), out, "saved in the new order");
  await rain.screenshot({ path: `${process.env.TEMP || "/tmp"}/rain-route.png` });
  assert.deepEqual(errors, []);
  console.log("PASS rain route: rain from 10 AM over the outside stop -> warned with Do it first; ☔ Outside work first makes it stop 1 (saved) and the line calms");
} finally {
  await browser.close();
}
