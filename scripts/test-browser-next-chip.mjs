// "Next" on the map (23 Oct, complete flow) at iPhone size: with no urgent notice, the pill at the bottom shows the next
// thing to do, most pressing first: bids due today not faxed -> tap opens the bids. With an urgent notice it stays the
// notice countdown (the notice comes first).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 2).map((b) => ({ ...b, bidDue: today, bidDueTime: "11:59 PM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function page({ notices, noBids = false, texted = "", midday = false, apptSoon = "" }) {
  // With notices: one 24-hour notice of our own, overdue (the real emails may have none that day), on a fixed Wednesday.
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  // No HPD emails at all: no urgent notice on the board.
  await routePrivate(c, notices
    ? { conversations: (d) => ({ ...d, threads: [{ id: "test-24", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99997", omos: ["EQ99997"], kind: "past due", people: ["Test Tracker"], count: 1, lastAt: "2026-10-20T13:00:00Z", waiting: true, messages: [{ at: "2026-10-20T13:00:00Z", from: "test@hpd.nyc.gov", hpd: true, mine: false, subject: "24 HR", text: "Notice test@hpd.nyc.gov", files: [] }] }] }) }
    : { conversations: (d) => ({ ...d, threads: [] }) });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids: noBids ? [] : bids } }));
  // A tenant texted two days ago with no answer.
  if (texted) await c.addInitScript((j) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [j]: { TenantTextedAt: new Date(Date.now() - 2 * 86400000).toISOString(), TenantRepliedAt: "" } })); sessionStorage.setItem("seeded", "1"); } }, texted);
  // An appointment starting in 10 minutes (New York time), not arrived.
  if (apptSoon) await c.addInitScript((j) => {
    if (sessionStorage.getItem("seeded")) return;
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(Date.now() + 10 * 60000)).map((x) => [x.type, x.value]));
    const start = `${p.hour}:${p.minute}`, end = `${String(Math.min(23, Number(p.hour) + 1)).padStart(2, "0")}:${p.minute}`;
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify({ [j]: { Appointment: { date: `${p.year}-${p.month}-${p.day}`, start, end, state: "confirmed", contact: "Tenant", phone: "", note: "", reminder: 60 } } }));
    sessionStorage.setItem("seeded", "1");
  }, apptSoon);
  const p = await c.newPage();
  // "Call the tenant" only shows from 8 AM (no calls at night): run that case at noon New York today.
  if (notices) await p.clock.install({ time: new Date("2026-10-21T15:00:00Z") });
  if (midday) { const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); await p.clock.install({ time: new Date(`${d}T16:00:00Z`) }); }
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await p.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await p.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await p.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  return { c, p, errors };
}
try {
  {
    const { c, p, errors } = await page({ notices: false });
    const chip = p.locator('[data-hpd-smoke="fc-next-chip"]');
    await chip.waitFor({ timeout: 30000 });
    assert.equal(await chip.getAttribute("data-kind"), "bids");
    assert.match((await chip.innerText()).replace(/\s+/g, " "), /Next: 2 bids due today · first 11:59 PM/);
    if (shots) await p.screenshot({ path: `${shots}/next-chip.png` });
    await chip.click();
    await p.locator('[data-hpd-smoke="fc-bids-banner"]').waitFor({ timeout: 15000 });
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    const { c, p, errors } = await page({ notices: true });
    await p.locator('[data-hpd-smoke="fc-focus-chip"]').waitFor({ timeout: 30000 });
    assert.equal(await p.locator('[data-hpd-smoke="fc-next-chip"]').count(), 0, "an urgent notice comes first");
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    const { c, p, errors } = await page({ notices: false, noBids: true, texted: "EQ15239", midday: true });
    const chip = p.locator('[data-hpd-smoke="fc-next-chip"]');
    await chip.waitFor({ timeout: 30000 });
    assert.equal(await chip.getAttribute("data-kind"), "call");
    assert.match((await chip.innerText()).replace(/\s+/g, " "), /Next: Call the tenant at .* \(no answer to the text\)/);
    await chip.click();
    await p.locator("#fc-job-card").waitFor({ timeout: 15000 });
    assert.match(await p.locator("#fc-job-card").innerText(), /EQ15239/);
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    // Skipped late at night (an appointment 10 minutes from now can't end the same day after 11 PM).
    const hourNy = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    if (hourNy < 22) {
      const { c, p, errors } = await page({ notices: false, noBids: true, apptSoon: "EQ15239" });
      const chip = p.locator('[data-hpd-smoke="fc-next-chip"]');
      await chip.waitFor({ timeout: 30000 });
      assert.equal(await chip.getAttribute("data-kind"), "late");
      assert.match((await chip.innerText()).replace(/\s+/g, " "), /Next: Appointment .* at 1207 1 AVENUE: running late\? Text the tenant/);
      assert.deepEqual(errors, []);
      await c.close();
    }
  }
  console.log("PASS next chip: no urgent notice -> 'Next: 2 bids due today · first 11:59 PM' opens the bids; with an urgent notice the notice countdown shows instead; no bids and a tenant texted 2 days ago -> 'Call the tenant at …' opens the job; an appointment in 10 minutes, not there yet -> 'running late? Text the tenant'");
} finally {
  await browser.close();
}
