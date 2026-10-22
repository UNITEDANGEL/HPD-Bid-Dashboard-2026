// No duplicate buttons (owner, 22 Oct: "why are there duplicate Today's route; job card had Waze and Google already,
// why repeat it twice; I don't want to see duplicate buttons at all in the entire app"), at iPhone size on real data:
// the map has one way to Today's route (the round Route button, no bar at the bottom), the appointments button says
// Appts, no two visible buttons with the same name; a job card has one Waze and one Google; the urgent box offers
// "✓ I handled it" (two taps) which closes it and tells the server, so the phone reminders stop.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const visibleNames = (page, scope = "body") => page.evaluate((sel) => [...document.querySelectorAll(`${sel} button, ${sel} a`)].filter((e) => {
  const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight && !e.closest(".leaflet-control-attribution, .leaflet-pane");
}).map((e) => (e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").replace(/\d+/g, "#").trim().toLowerCase()).filter(Boolean), scope);
const dups = (names) => Object.entries(names.reduce((m, t) => ((m[t] = (m[t] || 0) + 1), m), {})).filter(([, n]) => n > 1).map(([t]) => t);
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posted = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { try { posted.push(JSON.parse(r.request().postData() || "{}")); } catch { /* not json */ } return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await c.addInitScript(() => { try { localStorage.setItem("hpd-test-critical", "1"); } catch { /* private mode */ } });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  // Clear any real alert box first (it's tested below).
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();

  // The map.
  assert.equal(await page.locator(".fc-today-route .fc-route-toggle").filter({ visible: true }).count(), 0, "no Today's route bar at the bottom");
  assert.match(await page.locator('[data-hpd-smoke="fc-appts-open"]').innerText(), /Appts/);
  const mapNames = await visibleNames(page);
  assert.deepEqual(dups(mapNames), [], `map: the same button twice: ${dups(mapNames)}`);
  if (shots) await page.screenshot({ path: `${shots}/nodupes-map.png` });
  // The route button still opens Today's route (once), and closes it.
  await page.locator('[data-hpd-smoke="fc-route-open"]').click();
  await page.locator('.fc-route-toggle[aria-expanded="true"]').waitFor({ timeout: 10000 });
  const routeNames = await visibleNames(page, ".fc-today-route");
  assert.deepEqual(dups(routeNames.filter((n) => !/^[↑↓]$|^skip$/.test(n))), [], `route panel: the same button twice: ${dups(routeNames)}`);
  await page.locator('[data-hpd-smoke="fc-route-open"]').click();

  // A job card: one Waze, one Google.
  await page.locator(".fc-pin").first().click({ force: true });
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const card = await page.evaluate(() => [...document.querySelectorAll("#fc-job-card a, #fc-job-card button")].map((e) => (e.innerText || "").trim()));
  assert.ok(card.filter((t) => /^Waze$/i.test(t)).length <= 1 && card.filter((t) => /^Google$/i.test(t)).length <= 1, `job card: Waze ${card.filter((t) => /^Waze$/i.test(t)).length}, Google ${card.filter((t) => /^Google$/i.test(t)).length}`);
  await page.locator(".fc-job-sheet-close").click();

  // The urgent box: "✓ I handled it" takes two taps, closes it and tells the server.
  await page.evaluate(() => { try { localStorage.removeItem("hpd-snooze-ER01987"); } catch { /* private mode */ } }); // snoozed above
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("hpd-notify", { detail: { kind: "urgent", go: "board", omo: "ER01987", title: "⏰ ER01987: notice overdue", text: "Nothing sent yet: answer them now" } })));
  const box = page.locator('[data-hpd-smoke="fc-critical"]');
  await box.waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-focus-chip"]').count(), 0, "the overdue chip steps aside while the box shows the same notice");
  await box.locator('[data-hpd-smoke="fc-critical-handled"]').click();
  assert.match(await box.locator('[data-hpd-smoke="fc-critical-handled"]').innerText(), /Tap again/);
  assert.equal(posted.filter((p) => p.key === "HANDLED-ER01987").length, 0, "first tap only asks");
  await box.locator('[data-hpd-smoke="fc-critical-handled"]').click();
  await page.waitForTimeout(500);
  assert.equal(await box.count(), 0, "closed");
  assert.ok(posted.some((p) => p.key === "HANDLED-ER01987" && p.patch?.at), "the server is told (phone reminders stop)");
  assert.deepEqual(errors, []);
  console.log(`PASS no duplicates: map ${mapNames.length} buttons, none twice (Route only, Appts), route panel none twice, job card one Waze / one Google; "✓ I handled it" (two taps) closes the urgent box and saves HANDLED-ER01987`);
  await c.close();
} finally {
  await browser.close();
}
