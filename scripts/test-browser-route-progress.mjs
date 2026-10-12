// Browser test of finished stops on Today's route at iPhone size: a stop finished today stays on the
// route with a ✓ (list and map), stops keep their numbers, progress shows "1 of 3 done", and
// reordering or rebuilding keeps the finished stop. Saved steps live on this browser only; the live
// status server and the road-routing service are answered here.
// Needs the app running. BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const doneAt = new Date(Date.now() - 20 * 60000).toISOString();
const route = ["EQ21462", "EQ13990", "EQ16020"];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await context.addInitScript(({ route, today, doneAt }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [route[0]]: { FieldOutcome: "WORK_COMPLETED", WorkflowStatus: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: doneAt, outcome: "WORK_COMPLETED", note: "" }] } }));
    localStorage.setItem("hpd-today-route-v1", JSON.stringify({ settings: { date: today, start: "08:00", end: "17:00", minutes: 45, borough: "ALL" }, ids: route, origin: { point: { lat: 40.6966, lng: -73.8273 }, label: "office" } }));
    sessionStorage.setItem("seeded", "1");
  }, { route, today, doneAt });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-route-open"]').click();
  await page.locator('[data-hpd-smoke="fc-route-done-row"]').waitFor({ timeout: 30000 });

  const read = async () => ({
    toggle: (await page.locator(".fc-route-toggle").first().innerText()).replace(/\s+/g, " "),
    progress: await page.locator('[data-hpd-smoke="fc-route-progress"]').innerText(),
    done: (await page.locator('[data-hpd-smoke="fc-route-done-row"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ")),
    open: (await page.locator("li:not(.fc-route-done-row) > .fc-route-stop b").allInnerTexts()),
    mapDone: await page.locator(".fc-route-done").count(),
    mapNumbers: await page.locator(".fc-route-number").allInnerTexts(),
  });
  const first = await read();
  console.log("Start:", JSON.stringify(first));
  assert.match(first.toggle, /Today's route \(1\/3 done\)/);
  assert.equal(first.progress, "✓ 1 of 3 done · 2 to go");
  assert.equal(first.done.length, 1);
  assert.match(first.done[0], new RegExp(`^✓ 1\\. ${route[0]} .* Work completed · \\d{1,2}:\\d{2} [AP]M$`));
  assert.deepEqual(first.open, [`2. ${route[1]}`, `3. ${route[2]}`]);
  assert.equal(first.mapDone, 1, "a green ✓ on the map for the finished stop");
  assert.deepEqual(first.mapNumbers.sort(), ["2", "3"], "map numbers match the list");

  // Move stop 2 down: the open stops swap, the finished stop stays stop 1.
  await page.getByRole("button", { name: `Move ${route[1]} later` }).click();
  const moved = await read();
  assert.deepEqual(moved.open, [`2. ${route[2]}`, `3. ${route[1]}`]);
  assert.match(moved.done[0], new RegExp(`^✓ 1\\. ${route[0]}`));

  // Rebuild mid-day: the finished stop is kept at the top, ✓ still shown.
  await page.locator("details summary").first().click().catch(() => {});
  await page.getByRole("button", { name: "Rebuild route" }).click();
  await page.waitForTimeout(800);
  const rebuilt = await read();
  assert.match(rebuilt.done[0] || "", new RegExp(`^✓ 1\\. ${route[0]}`), "rebuild keeps the finished stop");
  assert.ok(rebuilt.open.length >= 1 && rebuilt.open[0].startsWith("2. "), `rebuilt stops continue from 2: ${rebuilt.open}`);
  assert.match(rebuilt.progress, /^✓ 1 of \d+ done · \d+ to go$/);

  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS route progress: ✓ ${route[0]} kept as stop 1 (list + map), "1 of 3 done", numbers match the map, reorder and rebuild keep it; rebuilt: ${rebuilt.open.length + 1} stops`);
} finally {
  await browser.close();
}
