// 📸 New worker photos (plan item 43, 26 Nov): a job whose worker's Before / After came in (WorkerNewAt on the status
// server, not seen yet) shows "📸 new from worker" on Home's Maturity this week card and on its map pin; a job already
// brought in (WorkerSeenAt later) shows none. iPhone size.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" });
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const all = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
  const placed = all.filter((j) => Number(j.Latitude) && Number(j.Longitude) && /^E[A-Z]\d+$/.test(String(j.OMO || "")));
  const [fresh, seen] = placed.slice(0, 2).map((j) => j.OMO);
  const jobs = all.map((j) => (j.OMO === fresh || j.OMO === seen ? { ...j, AwardDate: day(-5), WorkCompletionDate: day(j.OMO === fresh ? 2 : 4) } : { ...j, AwardDate: "01/05/25" }));
  const overrides = { [fresh]: { OMO: fresh, WorkerNewAt: ago(20) }, [seen]: { OMO: seen, WorkerNewAt: ago(60), WorkerSeenAt: ago(30) } };
  await c.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: jobs }));
  await c.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  await c.route("**/data/hpd_job_status.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // Home: Maturity this week.
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  const mw = page.locator('[data-hpd-smoke="home-maturity-week"]');
  await mw.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="home-maturity-week-worker-new"]').length > 0, null, { timeout: 15000 });
  const rows = await mw.locator('[data-hpd-smoke="home-maturity-week-row"]').evaluateAll((els) => els.map((e) => ({ text: e.textContent || "", tag: !!e.querySelector('[data-hpd-smoke="home-maturity-week-worker-new"]') })));
  const freshRow = rows.find((r) => r.text.startsWith(fresh));
  const seenRow = rows.find((r) => r.text.startsWith(seen));
  assert.ok(freshRow && seenRow, `both jobs on the card: ${JSON.stringify(rows)}`);
  assert.equal(freshRow.tag, true, "new worker photos: tag");
  assert.match(freshRow.text, /📸 new from worker/);
  assert.equal(seenRow.tag, false, "already brought in: no tag");

  // Map pin.
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-worker-new"]').length > 0, null, { timeout: 30000 });
  const tags = await page.locator('[data-hpd-smoke="fc-worker-new"]').evaluateAll((els) => els.map((e) => ({ text: e.textContent, title: e.closest(".leaflet-marker-icon")?.getAttribute("title") || "" })));
  assert.ok(tags.some((t) => t.title.startsWith(fresh) && t.text === "📸 new from worker"), `fresh job's pin has the tag: ${JSON.stringify(tags)}`);
  assert.ok(!tags.some((t) => t.title.startsWith(seen)), `seen job's pin has none: ${JSON.stringify(tags)}`);
  assert.deepEqual(errors, []);
  console.log(`worker-new browser test passed (${fresh} tagged on Home + map, ${seen} none)`);
} finally {
  await browser.close();
}
