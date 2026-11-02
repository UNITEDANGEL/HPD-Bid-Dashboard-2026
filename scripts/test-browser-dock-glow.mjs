// The bottom buttons glow when something there needs you (owner, 2 Nov: "bids, notices, jobs: glowing a little so I
// know to pay attention"), at iPhone size: a bid due later today and not sent -> Bids glows; once it's faxed (sent on
// record) -> no glow. Real invitations, with the due dates set here; the status server is faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const ny = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const today = ny(new Date()), later = ny(new Date(Date.now() + 5 * 86400000));
// Due today at 11:59 PM (still open now), the rest later.
const bids = fetched.bids.slice(0, 4).map((b, i) => ({ ...b, bidDue: i === 0 ? today : later, bidDueTime: "11:59 PM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const open = async (sent) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await routePrivate(c);
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
    if (sent) await c.addInitScript(([omo, due]) => localStorage.setItem("hpd-bid-records-v1", JSON.stringify({ [omo]: { omo, bidDue: due, price: 900, status: "sent", sentAt: new Date().toISOString(), attempts: 1, savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } })), [bids[0].omo, today]);
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 20, null, { timeout: 120000 });
    return { c, page, errors };
  };
  const a = await open(false);
  const bidsBtn = a.page.locator('[data-hpd-smoke="fc-bids-open"]');
  await a.page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-bids-open"]')?.classList.contains("is-glow"), null, { timeout: 20000 });
  assert.equal(await bidsBtn.getAttribute("data-glow"), "1");
  const anim = await bidsBtn.evaluate((el) => getComputedStyle(el, "::before").animationName);
  assert.equal(anim, "fc-dock-glow", "it pulses");
  if (process.env.SHOTS) await a.page.locator('[data-hpd-smoke="fc-dock"]').screenshot({ path: `${process.env.SHOTS}/dock-glow.png` });
  assert.deepEqual(a.errors, []);
  await a.c.close();
  // Faxed: nothing waiting today, no glow.
  const b = await open(true);
  await b.page.waitForTimeout(3000);
  assert.equal(await b.page.locator('[data-hpd-smoke="fc-bids-open"]').getAttribute("data-glow"), null, "sent: no glow");
  assert.ok(!(await b.page.locator('[data-hpd-smoke="fc-bids-open"]').getAttribute("class")).includes("is-glow"));
  // Notices / Jobs follow their own rule: glow exactly when they're marked urgent / red.
  const n = b.page.locator('[data-hpd-smoke="fc-notices-open"]');
  assert.equal((await n.getAttribute("class")).includes("is-glow"), (await n.getAttribute("class")).includes("is-urgent"));
  assert.deepEqual(b.errors, []);
  await b.c.close();
  console.log("PASS bottom buttons glow: a bid due today not sent -> Bids glows and pulses; faxed -> no glow; Notices glows exactly when a notice is urgent");
} finally {
  await browser.close();
}
