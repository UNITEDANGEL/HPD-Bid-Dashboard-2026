// Alerts that came while the app was closed are read out on one tap (owner, 22 Oct: "voice alerts on my iPhone too"):
// a locked iPhone can't speak, so the service worker keeps each push ("/missed" in the "hpd-badge" cache) and the map
// shows "🔊 Play N new alerts"; the tap says them (tone-free, one after another) and clears the list; they're in 🔔.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript(() => {
    window.__said = [];
    const real = window.speechSynthesis;
    if (real) real.speak = (u) => { window.__said.push(u.text); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  // Two pushes arrived while the phone was locked.
  await page.evaluate(async () => {
    const c = await caches.open("hpd-badge");
    await c.put("/missed", new Response(JSON.stringify([
      { title: "📋 Deoranie Gafur asked for documents", body: "Missing documents for 3 work orders: EP27489 affidavit and invoice", kind: "request", url: "", at: "2026-10-22T13:00:00Z" },
      { title: "🧾 New invitation to bid · ER07749", body: "1234 Main St · due 10/24 11:00 AM", kind: "bid", url: "", at: "2026-10-22T13:05:00Z" },
    ])));
  });
  await page.reload({ waitUntil: "load" });
  const card = page.locator('[data-hpd-smoke="fc-missed"]');
  await card.waitFor({ timeout: 30000 });
  assert.match(await card.innerText(), /Play 2 new alerts/);
  if (shots) await page.screenshot({ path: `${shots}/missed.png` });
  await card.locator('[data-hpd-smoke="fc-missed-play"]').click();
  await page.waitForFunction(() => window.__said.some((t) => /new alerts/.test(t)), null, { timeout: 5000 });
  const said = await page.evaluate(() => window.__said.find((t) => /new alerts/.test(t)));
  // Invitations first, counted, no work order (22 Oct); then the rest.
  assert.match(said, /^2 new alerts\. 1\. New invitation to bid\. 2\. Request from Gafur, requesting documents\. Missing documents for 3 work orders: E P 2 7 4 8 9/);
  assert.doesNotMatch(said, /E R 0 7 7 4 9/);
  assert.equal(await card.count(), 0, "gone after playing");
  assert.equal(await page.evaluate(async () => !!(await (await caches.open("hpd-badge")).match("/missed"))), false, "the list is cleared");
  const logged = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-notifications-v1") || "[]").map((n) => n.title));
  assert.ok(logged.some((t) => /Gafur asked for documents/.test(t)) && logged.some((t) => /New invitation to bid/.test(t)), "both in 🔔");
  assert.deepEqual(errors, []);
  console.log(`PASS missed alerts: 2 pushes from a locked phone -> "🔊 Play 2 new alerts" -> said "${said.slice(0, 90)}…", cleared, both in 🔔`);
  await c.close();
} finally {
  await browser.close();
}
