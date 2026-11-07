// 🗺 The route that learns (idea list, 3 Nov): a building you were timed at before (⏱ I'm here -> done, 80 min) gets
// 80 minutes on Today's route, with why ("your last visit at this building"); the other stops keep Minutes per job (45).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const route = ["EQ15239", "EQ24465"];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.addInitScript(({ route, today, yesterday }) => {
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [route[0]]: { FieldArrivedAt: `${yesterday}T15:00:00.000Z`, ActualWorkCompletionDate: `${yesterday}T16:20:00.000Z` } }));
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: route, origin: { point: { lat: 40.6966, lng: -73.8273 }, label: "office" } }));
    sessionStorage.setItem("seeded", "1");
  }, { route, today, yesterday });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').click(); await page.locator('[data-hpd-smoke="fc-route-open"]').click();
  const stops = page.locator(".fc-route-stop");
  await stops.first().waitFor({ timeout: 30000 });
  const texts = (await stops.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  const first = texts.find((t) => t.includes(route[0])), second = texts.find((t) => t.includes(route[1]));
  assert.ok(first && second, texts.join(" | "));
  assert.match(first, /⏱ 80 min here: your last visit at this building/);
  const span = (t) => { const m = /(\d{2}):(\d{2})-(\d{2}):(\d{2})/.exec(t); return (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2])); };
  assert.equal(span(first), 80, first);
  assert.equal(span(second), 45, second);
  assert.ok(!/⏱ \d+ min here/.test(second));
  // 📤 Send this route: times, addresses and work orders, the whole route link; no tenant data.
  await page.locator('[data-hpd-smoke="fc-route-share"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const shared = await page.evaluate(() => window.__shared.text);
  assert.match(shared, /^Route for \w+day, \w{3} \d{1,2}: 2 stops\n1\. \d{2}:\d{2} 1207 1 AVENUE \(EQ15239\)\n2\. \d{2}:\d{2} 541 ISHAM STREET \(EQ24465\)\nWhole route: https:\/\/www\.google\.com\/maps\/dir\//);
  assert.ok(!/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(shared.replace(/https:\S+/, "")), "no phone numbers");
  assert.match(await page.locator(".fc-today-route [role=status]").innerText(), /Route sent/);
  assert.deepEqual(errors, []);
  console.log("PASS the route learns: a building timed at 80 min before gets 80 min on today's route (with why); others keep 45; 📤 Send this route shares times, addresses and work orders + the map link");
} finally {
  await browser.close();
}
