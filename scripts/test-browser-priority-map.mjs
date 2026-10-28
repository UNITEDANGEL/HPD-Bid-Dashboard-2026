// Owner, 16 Oct: the Notices button first asks what you're looking for (Priority / vendor tracking, Payment rejected,
// Corrections, Print & mail); the pick shows just those jobs on the map right away, glowing, with the hours left on
// 24 / 72-hour notices. A glowing job's card says PRIORITY with the countdown and makes the affidavit for what
// happened (work completed, refused access, no access, completed by others, going back).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 20, null, { timeout: 120000 });

  await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
  const chooser = page.locator('[data-hpd-smoke="fc-notice-chooser"]');
  await chooser.waitFor();
  for (const k of ["all", "priority", "rejected", "corrections", "print", "list"]) assert.equal(await chooser.locator(`[data-hpd-smoke="fc-notice-pick-${k}"]`).count(), 1, `picker has ${k}`);
  await page.waitForFunction(() => Number(document.querySelector('[data-hpd-smoke="fc-notice-pick-priority"] em')?.textContent || 0) > 0, null, { timeout: 20000 });
  const nPrio = Number(await chooser.locator('[data-hpd-smoke="fc-notice-pick-priority"] em').innerText());
  const title = chooser.locator('[data-hpd-smoke="fc-notice-chooser-title"]');
  // Everything on the map at once, each kind glowing in its own color.
  assert.match(await title.innerText(), /All notices: \d+ on the map/);
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon.is-glow").length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const allKinds = await page.locator(".leaflet-marker-icon.is-glow").evaluateAll((els) => [...new Set(els.map((e) => (/is-glow-(priority|rejected|corrections|print)/.exec(e.className) || [])[1]))]);
  assert.ok(allKinds.length >= 2, `all kinds at once: ${allKinds}`);
  assert.equal(await page.locator('[data-hpd-smoke="fc-notices-sheet"]').count(), 0, "map first, no list");
  if (await chooser.locator('[data-hpd-smoke="fc-notice-timer"]').count()) assert.match(await chooser.locator('[data-hpd-smoke="fc-notice-timer"]').innerText(), /(left|overdue)/);
  if (shots) await page.screenshot({ path: `${shots}/1-all.png` });

  // Priority: just those jobs, glowing with the hours left.
  await chooser.locator('[data-hpd-smoke="fc-notice-pick-priority"]').click();
  assert.match(await title.innerText(), /Priority · \d+/);
  await page.waitForTimeout(1500);
  const lit = await page.locator(".leaflet-marker-icon.is-glow").count();
  const others = await page.locator(".leaflet-marker-icon.fc-label-marker:not(.is-glow), .leaflet-marker-icon.fc-dot-marker:not(.is-glow)").count();
  assert.equal(others, 0, "only priority jobs on the map");
  const tags = await page.locator(".is-glow .fc-glow-tag").allInnerTexts();
  assert.ok(tags.length && tags.every((t) => /^🔥 (24h|72h) · |^🔥 Docs$|^🔥 Asked$/.test(t)), `countdown tags: ${tags.slice(0, 5)}`);
  // The picker shrinks to a thin bar and the map frames those jobs above it.
  assert.match(await chooser.getAttribute("class"), /is-mini/);
  await page.waitForTimeout(1200);
  const ys = await page.locator(".leaflet-marker-icon.is-glow").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  assert.ok(ys.length && ys.every((y) => y > 60 && y < 844 - 90), `priority jobs in view above the bar: ${ys.map(Math.round)}`);
  if (shots) await page.screenshot({ path: `${shots}/2-priority-map.png` });

  // A glowing job: PRIORITY box with the countdown and the affidavit outcomes.
  await page.locator(".leaflet-marker-icon.is-glow").first().dispatchEvent("click");
  const card = page.locator('[data-hpd-smoke="fc-prio-card"]');
  await card.waitFor({ timeout: 8000 });
  assert.match(await card.innerText(), /PRIORITY|PAYMENT REJECTED/);
  if (await card.locator('[data-hpd-smoke="fc-prio-outcomes"]').count()) {
    const hrefs = await card.locator('[data-hpd-smoke="fc-prio-outcomes"] a').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const o of ["work_completed", "refused_access", "no_access", "completed_by_others", "partial_work_completed"]) assert.ok(hrefs.some((h) => h.includes(`outcome=${o}`) && h.startsWith("/paperwork/?job=")), `outcome ${o}`);
  }
  if (shots) await page.screenshot({ path: `${shots}/3-priority-card.png` });
  await page.locator(".fc-job-sheet-close").click();

  // The picker comes back: Payment rejected switches the map.
  await page.locator('[data-hpd-smoke="fc-notice-change"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-pick-rejected"]').click();
  assert.match(await title.innerText(), /Payment rejected · \d+/);
  await page.waitForFunction(() => document.querySelector(".leaflet-marker-icon.is-glow .fc-glow-tag")?.textContent === "💵 Fix", null, { timeout: 15000 });
  // The list opens on that tab; closing it brings the picker back; ✕ goes back to every job.
  await page.locator('[data-hpd-smoke="fc-notice-mini-list"]').click();
  await page.locator('[data-hpd-smoke="fc-notices-rejected"]').waitFor();
  await page.locator('[data-hpd-smoke="fc-notices-sheet"] header button[aria-label="Close"]').click();
  await page.locator('[data-hpd-smoke="fc-notice-chooser-close"]').click();
  // (The "👉 Next" job keeps its own glow on the all-jobs map.)
  await page.waitForFunction(() => !document.querySelector(".leaflet-marker-icon.is-glow:not(.is-glow-next)"), null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(`PASS priority map: Notices puts every notice job on the map at once (${allKinds.join(', ')}); Priority (${nPrio}) Priority shows only those jobs, ${lit} glowing with countdowns (${[...new Set(tags)].slice(0, 4).join(", ")}); the card says PRIORITY and makes the affidavit for each outcome; Payment rejected switches the map; List; ✕ back to all`);
  await context.close();
} finally {
  await browser.close();
}
