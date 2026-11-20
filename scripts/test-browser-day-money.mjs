// 💵 Today's money (idea list) at iPhone size, Wednesday Nov 11 3 PM New York: one job finished today ($ its award) and
// one on Monday -> the chip "💵 $X today · $Y week" next to the weather; tap -> the helper lists today's job. No real data
// leaves the test (status server faked).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.addInitScript(() => { if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 20); }; });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date("2026-11-11T20:00:00Z") });
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  // Two jobs with an award amount (read on their cards).
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  const amounts = {};
  for (const id of ids.slice(0, 30)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.clock.runFor(400);
    const m = /\$\s?([\d,]+)(?:\.\d+)?/.exec(await page.locator("#fc-job-card").textContent());
    if (m) amounts[id] = Number(m[1].replace(/,/g, ""));
    await page.locator(".fc-job-sheet-close").click();
    if (Object.keys(amounts).length >= 3) break;
  }
  const [a, b, c] = Object.keys(amounts);
  assert.ok(a && b && c, "three jobs with an award");
  await page.evaluate(({ a, b, c }) => {
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({
      [a]: { FieldOutcome: "WORK_COMPLETED", ActualWorkCompletionDate: "2026-11-11T17:00:00.000Z" },
      [b]: { FieldOutcome: "WORK_COMPLETED", ActualWorkCompletionDate: "2026-11-09T15:00:00.000Z" },
      // 20 Nov (owner: "today's payment count is not showing all closed jobs"): refused access closed today counts too,
      // dated by when it was closed in the app.
      [c]: { FieldOutcome: "REFUSED_ACCESS", FieldVisitHistory: [{ recordedAt: "2026-11-11T18:30:00.000Z", outcome: "REFUSED_ACCESS", note: "" }] },
    }));
  }, { a, b, c });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const chip = page.locator('[data-hpd-smoke="fc-money-chip"]');
  await chip.waitFor({ timeout: 20000 });
  await page.clock.runFor(3000);
  const money = (n) => `$${n.toLocaleString("en-US")}`;
  const today = amounts[a] + amounts[c];
  const label = await chip.getAttribute("aria-label");
  assert.equal(label, `Earned ${money(today)} today, ${money(today + amounts[b])} this week. Tap for the jobs`);
  assert.match(await chip.textContent(), new RegExp(`^💵\\${money(today)}today \\(2 closed\\) · \\${money(today + amounts[b])} week$`));
  await chip.click();
  await page.waitForFunction(() => /earned today/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  const reply = await page.locator('[data-hpd-smoke="fc-agent-reply"]').textContent();
  assert.ok(reply.includes(`💵 ${money(today)} earned today (2 jobs closed); ${money(today + amounts[b])} this week (3 jobs).`), reply);
  assert.ok(reply.includes(a) && reply.includes(c));
  assert.deepEqual(errors, []);
  console.log("PASS day money: refused access closed today counts (2 closed on the chip); the chip shows today's and this week's money from finished jobs; tap lists today's job");
} finally {
  await browser.close();
}
