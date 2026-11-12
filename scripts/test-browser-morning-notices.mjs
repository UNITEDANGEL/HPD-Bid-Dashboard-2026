// 🗂 Notices every morning (idea list, 11 Nov): when a notice answer is still to send, the 8 AM ☀️ card offers
// "Notices first (N)"; one tap starts the notice walk on the first one. Seeded notice; nothing is sent (faked).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  // 8:00 AM New York today (EST, 13:00 UTC).
  const day = new Date().toISOString().slice(0, 10);
  const now = Date.parse(`${day}T13:00:00Z`);
  const ago = (h) => new Date(now - h * 3600000).toISOString();
  const OMO = "EQ15239";
  const seed = [{ id: "t-morning-1", subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${OMO}`, omos: [OMO], messages: [{ at: ago(6), from: "Test Tracker <test.tracker@hpd.nyc.gov>", hpd: true, mine: false, subject: "", text: `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${OMO}. test.tracker@hpd.nyc.gov`, files: [] }] }]
    .map((t) => ({ ...t, kind: "past due", people: ["Test Tracker"], count: 1, lastAt: t.messages[0].at, waiting: true }));
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [...seed, ...(d.threads || [])] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/router\.project-osrm\.org/, (r) => r.fulfill({ json: { code: "NoRoute" } }));
  await c.route("**/api/drive/hpd-reply", (r) => r.fulfill({ status: 500, json: { error: "test: no sending" } }));
  await c.addInitScript(() => {
    localStorage.setItem("hpd-test-morning", "1");
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 20); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(now) });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').first().click();
  const card = page.locator('[data-hpd-smoke="fc-morning"]');
  await card.waitFor({ timeout: 60000 });
  const btn = card.locator('[data-hpd-smoke="fc-morning-notices"]');
  await btn.waitFor({ timeout: 30000 });
  const label = await btn.innerText();
  const n = Number(label.match(/\((\d+)\)/)?.[1] || 0);
  assert.ok(n >= 1, `count on the button: ${label}`);
  await btn.click();
  const walk = page.locator('[data-hpd-smoke="fc-walk"]');
  await walk.waitFor({ timeout: 15000 });
  assert.match(await walk.locator('[data-hpd-smoke="fc-walk-count"]').innerText(), /of \d+/);
  assert.equal(await card.count(), 0, "the card goes away");
  const first = await walk.getAttribute("data-omo");
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(4000);
  assert.equal(await card.count(), 0, "once a day");
  assert.deepEqual(errors, []);
  console.log(`PASS morning notices: 8 AM card shows "${label}"; one tap -> the notice walk on ${first}; not shown again after a reload`);
  await c.close();
} finally {
  await browser.close();
}
