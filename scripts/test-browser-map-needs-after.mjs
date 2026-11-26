// 🟠 Needs After on the map (plan item 45, 26 Nov): an awarded job due this week with Before photos saved on the job and
// no After shows "🟠 needs After" on its map pin; a job that has its After shows none. iPhone size.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const day = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "2-digit" });
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const all = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
  const placed = all.filter((j) => Number(j.Latitude) && Number(j.Longitude) && /^E[A-Z]\d+$/.test(String(j.OMO || "")));
  const [needs, done] = placed.slice(0, 2).map((j) => j.OMO);
  const jobs = all.map((j) => (j.OMO === needs || j.OMO === done ? { ...j, AwardDate: day(-5), WorkCompletionDate: day(j.OMO === needs ? 2 : 4) } : { ...j, AwardDate: "01/05/25" }));
  const overrides = { [needs]: { OMO: needs, BeforePhotoCount: 3 }, [done]: { OMO: done, BeforePhotoCount: 2, AfterPhotoCount: 2 } };
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
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="fc-needs-after"]').length > 0, null, { timeout: 30000 });
  const tags = await page.locator('[data-hpd-smoke="fc-needs-after"]').evaluateAll((els) => els.map((e) => ({ text: e.textContent, title: e.closest(".leaflet-marker-icon")?.getAttribute("title") || "", bg: getComputedStyle(e).backgroundColor })));
  assert.ok(tags.some((t) => t.title.startsWith(needs) && t.text === "🟠 needs After"), `job with Before only has the tag: ${JSON.stringify(tags)}`);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="fc-needs-after"]')].some((e) => getComputedStyle(e).backgroundColor === "rgb(194, 65, 12)"), null, { timeout: 15000 }); // orange like Home
  assert.ok(!tags.some((t) => t.title.startsWith(done)), `job with its After has none: ${JSON.stringify(tags)}`);
  assert.deepEqual(errors, []);
  console.log(`map needs-After browser test passed (${needs} tagged, ${done} none)`);
} finally {
  await browser.close();
}
