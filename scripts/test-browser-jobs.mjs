// Jobs button (owner, 21 Oct: "there's a button for bids and notices, I need one for the jobs"), at iPhone sizes: the 🔨
// Jobs button sits with Close out / 2nd try (bottom left) and shows how many jobs are to do; it opens every open job --
// To do (late ones first, "Nd late" / "due M/D"), Close out, 2nd try, All -- with a search; tapping a job opens its card.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const seen = [];
  for (const [w, h] of [[390, 844], [375, 553]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
    const btn = page.locator('[data-hpd-smoke="fc-jobs-open"]');
    await btn.waitFor();
    const box = await btn.boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h, `${w}x${h}: Jobs button on screen`);
    const todo = Number(await btn.locator('[data-hpd-smoke="fc-jobs-count"]').innerText());
    await btn.click();
    const sheet = page.locator('[data-hpd-smoke="fc-jobs"]');
    await sheet.waitFor();
    assert.match(await sheet.locator('[data-hpd-smoke="fc-jobs-tab-todo"]').innerText(), new RegExp(`To do ${todo}`));
    const rows = sheet.locator('[data-hpd-smoke="fc-jobs-row"]');
    assert.equal(await rows.count(), todo, "To do list matches the badge");
    // Late ones first.
    const dues = await rows.evaluateAll((els) => els.map((e) => e.querySelector(".fc-jobs-due")?.textContent || ""));
    const firstOnTime = dues.findIndex((d) => !/late/.test(d));
    assert.ok(firstOnTime === -1 || dues.slice(firstOnTime).every((d) => !/late/.test(d)), `late jobs on top: ${dues.slice(0, 6)}`);
    if (shots && w === 390) await page.screenshot({ path: `${shots}/jobs-list.png` });
    // Other tabs.
    for (const t of ["closeout", "secondtry", "waiting", "all"]) {
      await sheet.locator(`[data-hpd-smoke="fc-jobs-tab-${t}"]`).click();
      const n = Number((/(\d+)$/.exec((await sheet.locator(`[data-hpd-smoke="fc-jobs-tab-${t}"]`).innerText()).trim()) || [])[1]);
      assert.equal(await rows.count(), n, `${t} count`);
    }
    // Search, then open a job.
    const omo = await rows.first().getAttribute("data-omo");
    await sheet.locator('[data-hpd-smoke="fc-jobs-search"]').fill(omo.slice(-4));
    assert.ok((await rows.count()) >= 1 && (await rows.evaluateAll((els) => els.every((e) => e.getAttribute("data-omo").includes(e.ownerDocument.querySelector('[data-hpd-smoke="fc-jobs-search"]').value)))), "search filters");
    await rows.filter({ has: page.locator(`.fc-jobs-main b`, { hasText: omo }) }).first().locator("button").click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(omo));
    assert.equal(await sheet.count(), 0, "the list closes when a job opens");
    assert.deepEqual(errors, []);
    seen.push(`${w}x${h}: ${todo} to do, opened ${omo}`);
    await c.close();
  }
  console.log(`PASS jobs button: on screen with the to-do count, opens To do (late first) / Close out / 2nd try / All with search, a job opens its card (${seen.join("; ")})`);
} finally {
  await browser.close();
}
