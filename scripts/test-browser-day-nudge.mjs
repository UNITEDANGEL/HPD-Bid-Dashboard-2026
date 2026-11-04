// End of day (owner idea, 3 Nov): after 6 PM the chat speaks up once with how the day went and what tomorrow holds;
// "Open" shows Today's summary. Before 6 PM it stays quiet.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const nyDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
const nyHour = (ms) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(ms)));
const day = nyDay(Date.now());
const at = (hour) => { for (let h = 0; h < 30; h += 1) { const ms = Date.parse(`${day}T00:00:00Z`) + h * 3600000 + 20 * 60000; if (nyDay(ms) === day && nyHour(ms) === hour) return ms; } throw new Error("no such hour"); };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [hour, expect] of [[14, false], [19, true]]) {
    const ctxTime = at(hour);
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
    const visited = new Date(ctxTime - 3600000).toISOString();
    await c.addInitScript(({ visited }) => {
      if (sessionStorage.getItem("seeded")) return;
      localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ EQ15239: { FieldOutcome: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: visited, outcome: "WORK_COMPLETED", note: "" }] } }));
      sessionStorage.setItem("seeded", "1");
    }, { visited });
    const page = await c.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date(ctxTime) });
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.clock.runFor(61000);
    const nudge = page.locator('[data-hpd-smoke="fc-chat-nudge"][data-kind="day"]');
    if (!expect) {
      await page.waitForTimeout(500);
      assert.equal(await nudge.count(), 0, "quiet before 6 PM");
    } else {
      await nudge.waitFor();
      assert.match(await page.locator('[data-hpd-smoke="fc-chat-nudge-text"]').innerText(), /^🌆 Today: 1 visited, 1 finished[^.]*\. Tomorrow: /);
      await page.locator('[data-hpd-smoke="fc-chat-nudge-go"]').click();
      await page.getByText("← Map").first().waitFor();
      await page.getByText("← Map").first().click();
      await page.clock.runFor(61000);
      assert.equal(await nudge.count(), 0, "once a day");
    }
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS day nudge: quiet at 2 PM; at 7 PM the chat says how the day went, Open shows the summary, only once");
} finally {
  await browser.close();
}
