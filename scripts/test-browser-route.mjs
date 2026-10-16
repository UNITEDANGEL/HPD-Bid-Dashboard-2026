// Browser test of Today's route on the field map at iPhone size: tap the route button, the day is
// planned, the line follows streets (not straight stop-to-stop lines) and every stop shows a real
// drive time. The live status server is answered here. By default the road-routing service is
// answered too (a canned street line), so CI never depends on it; REAL_ROUTING=1 uses the real one.
// Needs the app running. BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const realRouting = process.env.REAL_ROUTING === "1";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let routingCalls = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await routePrivate(context); // tenant data / invitation PDFs via the private route
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (route) => route.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/router\.project-osrm\.org/, async (route) => {
    routingCalls += 1;
    if (realRouting) return route.continue();
    // Canned answer: each leg bends through two extra corners, 1 mile and 6 minutes per leg.
    const coords = decodeURIComponent(new URL(route.request().url()).pathname.split("/driving/")[1]).split(";").map((p) => p.split(",").map(Number));
    const line = [coords[0]];
    for (let i = 1; i < coords.length; i++) {
      const [a, b] = [coords[i - 1], coords[i]];
      line.push([a[0], (a[1] + b[1]) / 2], [b[0], (a[1] + b[1]) / 2], b);
    }
    const legs = coords.slice(1).map(() => ({ distance: 1609.344, duration: 360 }));
    return route.fulfill({ json: { code: "Ok", routes: [{ distance: 1609.344 * legs.length, duration: 360 * legs.length, legs, geometry: { coordinates: line } }], waypoints: coords.map((c) => ({ location: c })) } });
  });
  await context.addInitScript(() => { if (!sessionStorage.getItem("route-test")) { localStorage.removeItem("hpd-today-route-v1"); sessionStorage.setItem("route-test", "1"); } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });

  // One tap on the route button: the panel opens and the day is planned.
  const button = page.locator('[data-hpd-smoke="fc-route-open"]');
  await button.waitFor({ state: "visible" });
  await button.click();
  await page.locator(".fc-route-stop").first().waitFor({ timeout: 30000 });
  const stopCount = await page.locator(".fc-route-stop").count();
  assert.ok(stopCount >= 2 && stopCount <= 8, `planned ${stopCount} stops`);

  // The road route arrives: total line, a drive time on every stop, and the line follows the streets.
  const total = page.locator('[data-hpd-smoke="fc-route-total"]');
  await page.waitForFunction(() => /Road route/.test(document.querySelector('[data-hpd-smoke="fc-route-total"]')?.textContent || ""), null, { timeout: 30000 });
  const totalText = await total.innerText();
  const stopTexts = await page.locator(".fc-route-stop").allInnerTexts();
  assert.ok(stopTexts.every((t) => /\d+ min drive · \d+\.\d mi/.test(t)), `every stop has a drive time:\n${stopTexts.join("\n")}`);
  const numbers = await page.locator(".fc-route-number").count();
  assert.equal(numbers, stopCount, "a numbered marker per stop");
  const vertices = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".leaflet-pane path.leaflet-interactive, .leaflet-pane path")].map((p) => (p.getAttribute("d") || "").split(/[LM]/).length - 1)));
  assert.ok(vertices > stopCount + 1, `route line has ${vertices} points for ${stopCount} stops: it follows streets`);
  assert.equal(await page.locator(".fc-route-direction").count(), stopCount, "a direction arrow on each leg");
  const allLink = await page.locator('[data-hpd-smoke="fc-route-all"]').getAttribute("href");
  assert.match(allLink, /google\.com\/maps\/dir\/\?api=1&travelmode=driving&origin=.*&destination=.*/);
  assert.equal((new URL(allLink).searchParams.get("waypoints") || "").split("|").filter(Boolean).length, stopCount - 1);
  assert.equal(routingCalls, 1, "the street route is fetched once");

  // Waze for the next stop and on every stop, opening Waze at that stop and starting navigation.
  const nextWaze = await page.locator('[data-hpd-smoke="fc-route-next-waze"]').getAttribute("href");
  assert.match(nextWaze, /^https:\/\/waze\.com\/ul\?ll=40\.\d+,-7[34]\.\d+&navigate=yes$/);
  assert.match(await page.locator('[data-hpd-smoke="fc-route-next-google"]').getAttribute("href"), /google\.com\/maps\/dir\/.*destination=/);
  const stopWaze = await page.locator(".fc-route-stop-actions a", { hasText: "Waze" }).evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  assert.equal(stopWaze.length, stopCount, "a Waze button on every stop");
  assert.equal(stopWaze[0], nextWaze, "the first stop's Waze matches the next-stop button");
  assert.equal(new Set(stopWaze).size, stopCount, "each Waze button goes to its own stop");

  // Close the panel, zoom far in somewhere else, tap the route button again: the whole route is back
  // in view (every numbered stop on screen), without fetching the street route again.
  await page.locator(".fc-route-toggle").first().click();
  await page.evaluate(() => { const zoomIn = document.querySelector(".leaflet-control-zoom-in"); for (let i = 0; i < 4; i++) zoomIn?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.mouse.move(195, 300); await page.mouse.down(); await page.mouse.move(60, 120, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(800);
  await button.click();
  await page.waitForTimeout(1500);
  const onScreen = await page.locator(".fc-route-number").evaluateAll((markers) => markers.filter((m) => { const r = m.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }).length);
  assert.equal(onScreen, stopCount, `all ${stopCount} stops back in view after reopening (got ${onScreen})`);
  assert.equal(routingCalls, 1, "reopening reuses the street route");

  assert.deepEqual(errors, [], "page errors");
  console.log(`PASS route: one tap plans ${stopCount} stops, street line (${vertices} points), drive time per stop, arrows, whole-route link, Waze on every stop, reopen shows the whole route; ${totalText.replace(/\s+/g, " ")}${realRouting ? " [real routing]" : ""}`);
} finally {
  await browser.close();
}
