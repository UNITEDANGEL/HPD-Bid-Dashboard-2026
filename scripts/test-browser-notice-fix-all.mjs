// 🔧 Fix all (owner, 10 Nov: "fix all"): two jobs HPD sent back -> the notices board shows "🔧 Fix all 2, one by one";
// tap -> the first opens auto-fixed with HPD's words, "Fixing one by one · 1 of 2", and Skip / Next goes to the second
// one with ITS words and marked copy (not a bare link). Nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
const A = "ER04312";
const B = "ER05228";
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const L = "Joy-Ann Lewis <lewis.test@hpd.nyc.gov>";
  const msg = (at, text, mine = false, files = []) => ({ at, from: mine ? "me" : L, hpd: !mine, mine, subject: "x", text, files });
  const thread = (id, omo, words, h) => ({ id, subject: `24 HR POOR PERFORMANCE NOTICE - OMO#${omo}`, omos: [omo], kind: "past due", people: ["Joy-Ann Lewis"], count: 3, lastAt: ago(h), waiting: true, messages: [
    msg(ago(h + 100), `Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#${omo}.\nJoy-Ann Lewis lewis.test@hpd.nyc.gov`),
    msg(ago(h + 50), "Attached.", true, [`${omo} AFF INVOICE.pdf`]),
    msg(ago(h), words, false, [`OMO#${omo}-ERRORS.pdf`]),
  ] });
  await routePrivate(c, { conversations: (d) => ({ ...d, threads: [
    thread("t-fixall-a", A, "Kindly see attached affidavit & invoice with highlighted errors. AFFIDAVIT- date directed by HPD is confirmation date of award.", 20),
    thread("t-fixall-b", B, "Kindly see attached affidavit & invoice with highlighted errors. Please make corrections & resubmit. Notary stamp missing.", 30),
  ] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const sends = [];
  await c.route("**/api/drive/**", (r) => { if (/hpd-reply|email-package|fax/.test(r.request().url())) sends.push(r.request().url()); return r.fulfill({ status: 401, json: { reconnectRequired: true } }); });
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-board-open"]').click();
  const all = page.locator('[data-hpd-smoke="fc-board-fix-all"]');
  await all.waitFor({ timeout: 20000 });
  assert.match(await all.innerText(), /^🔧 Fix all \d+, one by one$/);
  const queue = async () => page.evaluate(() => JSON.parse(sessionStorage.getItem("hpd-fix-queue") || "[]"));
  await all.click();
  await page.waitForURL(/\/paperwork\//);
  const q = await queue();
  const omos = q.map((x) => x.omo);
  assert.ok(omos.includes(A) && omos.includes(B), omos.join(","));
  assert.ok(q.every((x) => /&reason=.+&auto=1/.test(x.href) && /&marked=t-fixall-/.test(x.href)), "each with HPD's words and marked copy");
  // The first one opens with "1 of N" and a link on to the next with its own words.
  const where = page.locator('text=/Fixing one by one · 1 of \\d+/').first();
  await where.waitFor({ timeout: 120000 });
  const next = page.locator('[data-hpd-smoke="paperwork-fix-skip-early"], [data-hpd-smoke="paperwork-fix-next-go"], [data-hpd-smoke="paperwork-fix-skip"]').first();
  await next.waitFor({ timeout: 60000 });
  assert.equal(await next.getAttribute("href"), q[1].href);
  await next.click();
  await page.waitForURL(new RegExp(`job=${q[1].omo}`));
  await page.locator('text=/Fixing one by one · 2 of \\d+/').first().waitFor({ timeout: 120000 });
  assert.equal(sends.length, 0, "nothing sent");
  assert.deepEqual(errors, []);
  console.log(`PASS fix all: board "🔧 Fix all ${q.length}, one by one" -> ${q[0].omo} auto-fixed (1 of ${q.length}) -> Next goes to ${q[1].omo} with HPD's words and marked copy; nothing sent`);
} finally {
  await browser.close();
}
