// ⏳ Stuck jobs on the map (plan, 28 Nov): an awarded job whose Before photos reached the job 5 days ago with no After
// shows the red "⏳ stuck 5 days" tag on its map pin (instead of the orange "needs After"); a job with its After shows none. iPhone size.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" });
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const all = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
  const placed = all.filter((j) => Number(j.Latitude) && Number(j.Longitude) && /^E[A-Z]\d+$/.test(String(j.OMO || "")));
  const [stuck, done] = placed.slice(0, 2).map((j) => j.OMO);
  const jobs = all.map((j) => (j.OMO === stuck || j.OMO === done ? { ...j, AwardDate: day(-6), WorkCompletionDate: day(3) } : { ...j, AwardDate: "01/05/25" }));
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000 - 3600000).toISOString();
  const overrides = { [stuck]: { OMO: stuck, BeforePhotoCount: 3, BeforePhotoAt: fiveDaysAgo }, [done]: { OMO: done, BeforePhotoCount: 2, AfterPhotoCount: 2, BeforePhotoAt: fiveDaysAgo } };
  await c.route("**/data/COA_Fetcher_2026.json*", (r) => r.fulfill({ json: jobs }));
  await c.route("**/data/sent_paperwork.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  await c.route("**/data/hpd_job_status.json*", (r) => r.fulfill({ json: { jobs: {} } }));
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides, accepted: [] } }));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-stuck"]').length > 0, null, { timeout: 30000 });
  const tags = await page.locator('[data-hpd-smoke="fc-stuck"], [data-hpd-smoke="fc-needs-after"]').evaluateAll((els) => els.map((e) => ({ smoke: e.getAttribute("data-hpd-smoke"), text: e.textContent, title: e.closest(".leaflet-marker-icon")?.getAttribute("title") || "" })));
  assert.ok(tags.some((t) => t.title.startsWith(stuck) && t.smoke === "fc-stuck" && t.text === "⏳ stuck 5 days"), `stuck job has the red tag: ${JSON.stringify(tags)}`);
  assert.ok(!tags.some((t) => t.title.startsWith(stuck) && t.smoke === "fc-needs-after"), `stuck job doesn't also show the orange tag: ${JSON.stringify(tags)}`);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="fc-stuck"]')].some((e) => getComputedStyle(e).backgroundColor === "rgb(153, 27, 27)"), null, { timeout: 15000 }); // red like Home
  assert.ok(!tags.some((t) => t.title.startsWith(done)), `job with its After has none: ${JSON.stringify(tags)}`);
  assert.deepEqual(errors, []);
  console.log(`map stuck browser test passed (${stuck} tagged, ${done} none)`);
} finally {
  await browser.close();
}
