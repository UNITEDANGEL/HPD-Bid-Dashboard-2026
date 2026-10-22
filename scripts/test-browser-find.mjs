// Find any job (owner, 22 Oct: "I should be able to type a small description and it should guide me to the job; by
// address or job"), at iPhone size on real data: "mini split" finds ER08283 (3619 Bedford Avenue, an invitation, not
// one of yours) and tapping it shows HPD's description and the invitation; one of your jobs by part of its address
// opens its card; the job number works too; ✕ hides the list.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  // A stand-in for the phone's speech recognition: it "hears" one sentence.
  await c.addInitScript(() => {
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ results: [Object.assign([{ transcript: "find the job with mini split" }], { isFinal: true })] }); this.onend?.(); }, 200); }
      stop() { this.onend?.(); }
    };
  });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  const box = page.locator('[data-hpd-smoke="fc-search"]');
  const find = page.locator('[data-hpd-smoke="fc-find"]');
  const rows = find.locator('[data-hpd-smoke="fc-find-row"]');

  // A few words from HPD's description.
  await box.fill("mini split");
  await find.waitFor();
  await page.waitForFunction(() => /found/.test(document.querySelector('[data-hpd-smoke="fc-find-count"]')?.textContent || ""), null, { timeout: 30000 });
  const mini = rows.filter({ hasText: "ER08283" }).first();
  await mini.waitFor();
  assert.match(await mini.innerText(), /3619 BEDFORD AVENUE/);
  assert.match(await mini.innerText(), /MINI-SPLIT/i, "the matching words show");
  await mini.locator("button").first().click();
  const more = mini.locator('[data-hpd-smoke="fc-find-more"]');
  await more.waitFor();
  assert.match(await more.innerText(), /MOVE MINI-SPLIT CONDENSOR/);
  assert.ok(await more.locator('[data-hpd-smoke="fc-find-pdf"]').count(), "the invitation PDF link");
  if (shots) await page.screenshot({ path: `${shots}/find-mini-split.png` });

  // The job number.
  await box.fill("ER08283");
  await rows.first().waitFor();
  assert.equal(await rows.first().getAttribute("data-omo"), "ER08283");

  // One of your jobs by part of its address: its card opens.
  const mine = await page.evaluate(async () => {
    const d = await (await fetch("/api/private/search")).json();
    const it = d.items.find((i) => i.kinds.includes("yours") && /^\d+ [A-Z]{4,}/.test(i.address || "") && i.date >= "2026-01-01");
    return it ? { omo: it.omo, words: it.address.split(",")[0] } : null;
  });
  assert.ok(mine, "a 2026 job of yours with an address");
  await box.fill(mine.words);
  const row = rows.filter({ hasText: mine.omo }).first();
  await row.waitFor({ timeout: 20000 });
  await row.locator("button").first().click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(mine.omo));
  assert.equal(await find.count(), 0, "the list steps aside for the card");
  await page.locator(".fc-job-sheet-close").click();

  // 🎤 Say it: the phone's speech recognition (faked here) hears "find the job with mini split".
  await box.fill("");
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-search"]')?.value === "mini split", null, { timeout: 5000 });
  await rows.filter({ hasText: "ER08283" }).first().waitFor({ timeout: 20000 });
  // Recent searches: tap the empty box -> chips; a chip searches again.
  await page.waitForTimeout(2700);
  await page.locator('[data-hpd-smoke="fc-search-clear"]').click();
  await box.focus();
  const recent = page.locator('[data-hpd-smoke="fc-recent"]');
  await recent.waitFor({ timeout: 5000 });
  assert.match(await recent.innerText(), /mini split/);
  if (shots) await page.screenshot({ path: `${shots}/find-recent.png` });
  await recent.locator("button", { hasText: "mini split" }).first().click();
  assert.equal(await box.inputValue(), "mini split");

  // ✕ hides it until the words change.
  await box.fill("boiler");
  await find.waitFor();
  await find.locator('[data-hpd-smoke="fc-find-close"]').click();
  assert.equal(await find.count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS find any job: "mini split" -> ER08283 at 3619 Bedford Avenue (description + invitation), the job number finds it, "${mine.words}" opens your job ${mine.omo}, ✕ hides the list`);
  await c.close();
} finally {
  await browser.close();
}
