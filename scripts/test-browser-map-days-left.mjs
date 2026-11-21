// 📍 Days left on the map (plan, 21 Nov): awarded jobs not sent yet show a small badge with the days left to HPD's finish
// date (red when late); a job already sent shows none. iPhone size, three real jobs with their dates moved to "now".
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" });
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const res = await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`);
  const all = await res.json();
  const placed = all.filter((j) => Number(j.Latitude) && Number(j.Longitude) && /^E[A-Z]\d+$/.test(String(j.OMO || "")));
  const [late, soon, sent] = placed.slice(0, 3).map((j) => j.OMO);
  const plan = { [late]: [-12, -3], [soon]: [-4, 2], [sent]: [-6, 5] };
  const jobs = all.map((j) => (plan[j.OMO] ? { ...j, AwardDate: day(plan[j.OMO][0]), WorkCompletionDate: day(plan[j.OMO][1]) } : { ...j, AwardDate: "01/05/25" }));
  await c.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: jobs }));
  await c.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: { [sent]: { sentAt: new Date().toISOString(), count: 6 } } } }));
  await c.route("**/data/hpd_job_status.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  // The late one always shows its badge, even as a dot; wait for the follow data to arrive and the pins to redraw.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="fc-days-badge"]')].some((b) => /3d late/.test(b.textContent || "")), null, { timeout: 30000 });
  const badges = await page.locator('[data-hpd-smoke="fc-days-badge"]').evaluateAll((els) => els.map((e) => ({ text: e.textContent, cls: e.className, days: e.getAttribute("data-days"), title: e.closest(".leaflet-marker-icon")?.getAttribute("title") || "" })));
  const lateBadge = badges.find((b) => b.title.startsWith(late));
  assert.ok(lateBadge, `late job has a badge: ${JSON.stringify(badges)}`);
  assert.equal(lateBadge.text, "3d late");
  assert.equal(lateBadge.days, "-3");
  assert.match(lateBadge.cls, /is-late/, "late badge is red");
  assert.ok(!badges.some((b) => b.title.startsWith(sent)), `job already sent has no badge: ${JSON.stringify(badges)}`);
  assert.deepEqual(errors, []);
  console.log(`map days-left browser test passed (${badges.length} badge(s); late ${late}, soon ${soon}, sent ${sent} none)`);
} finally {
  await browser.close();
}
