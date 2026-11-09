// 📜 Insurance and license dates on the map (idea list: "the app warns you 30 days before an insurance or license paper
// runs out"): papers saved on the Your papers page show a chip on the map when one runs out within 30 days; All → Your
// papers says which and opens the page (← Map comes back); a lead bid warns when the lead paper runs out before the job
// would be done. Nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const day = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + n * 86400000));
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const lead = { ...fetched.bids[0], omo: "ER09991", bidDue: day(1), bidDueTime: "11:00 AM", workCompletion: day(1), kind: "lead", certs: "Mold and Lead", scopeFile: "ER09991.pdf",
  lead: { rooms: [{ room: "BATHROOM", total: { page: 0, x: 525, y: 468 }, items: [{ component: "SOUTH WALL", method: "Enclosure", qty: 50, um: "SQFT", page: 0, y: 541, rateRight: 459.7, costRight: 505.4 }] }] } };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const posts = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => { if (r.request().method() === "POST") posts.push(r.request().url()); return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }); });
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: [lead, ...fetched.bids.slice(1, 3)] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-paper-chip"]').count(), 0, "no chip with no papers");
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-more-papers"]').textContent(), /Your papers.*Insurance and license dates/);
  // Papers saved on the Your papers page (same phone storage): one fine, one running out in 12 days.
  await page.evaluate((p) => localStorage.setItem("hpd-papers", JSON.stringify(p)), [
    { id: "a", name: "General liability insurance", expires: day(200) },
    { id: "b", name: "Lead (EPA RRP) certificate", expires: day(12) },
  ]);
  await page.reload({ waitUntil: "load" });
  const chip = page.locator('[data-hpd-smoke="fc-paper-chip"]');
  await chip.waitFor({ timeout: 60000 });
  assert.match(await chip.textContent(), /Lead \(EPA RRP\) certif….*12 days left/);
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  assert.match(await page.locator('[data-hpd-smoke="fc-more-papers"]').textContent(), /⚠️ Lead \(EPA RRP\) certificate: 12 days left/);
  await page.locator('[data-hpd-smoke="fc-more-papers"]').click();
  await page.waitForURL(/\/papers\/$/, { timeout: 30000 });
  await page.locator('[data-hpd-smoke="papers"]').waitFor();
  assert.match(await page.locator('[data-hpd-smoke="papers"]').textContent(), /Lead \(EPA RRP\) certificate/);
  await page.locator('[data-hpd-smoke="papers-map"]').click();
  await page.waitForURL(/\/map\/$/, { timeout: 30000 });
  // The lead bid: the lead paper runs out before the job would be done.
  await page.goto(`${baseUrl}/map/?bids=1&omo=ER09991`, { waitUntil: "load", timeout: 180000 });
  const warn = page.locator('[data-hpd-smoke="fc-bid-cert-warn"]');
  await warn.waitFor({ timeout: 60000 });
  assert.match(await warn.textContent(), /Lead \(EPA RRP\) certificate runs out .*before this job would be done/);
  assert.doesNotMatch(await warn.textContent(), /General liability/);
  assert.deepEqual(posts, [], "nothing sent");
  assert.deepEqual(errors, []);
  console.log("PASS papers on the map: 30-day chip, All row says which and opens Your papers (← Map back), lead bid warns about the lead certificate; nothing sent");
} finally {
  await browser.close();
}
