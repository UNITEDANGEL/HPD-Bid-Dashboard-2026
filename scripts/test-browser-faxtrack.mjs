// Live fax tracker (owner, 21 Oct: "more interaction like sending, so I know it's going"), at iPhone size: price saved and
// package filled -> step 1 done; Send (two taps, the second pulses) -> "Sent to HumbleFax" spins while sending -> done,
// "Faxing HPD" spins with a moving line -> HumbleFax confirms -> "HPD received" done with a check + confetti burst. A
// failed fax turns the tracker red and shakes. The fax and HumbleFax are faked (slowed down to watch); nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() + 86400000));
const bids = fetched.bids.filter((b) => b.itbFile).slice(0, 4).map((b) => ({ ...b, bidDue: tomorrow, bidDueTime: "11:00 AM" }));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  await c.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  let faxStatus = "waiting";
  await c.route(/\/api\/drive\/fax-bid/, async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); return r.fulfill({ json: { sent: true, to: "2128638655@humblefax.com", messageId: "m1", sentAt: new Date().toISOString() } }); });
  await c.route(/\/api\/drive\/fax-status/, (r) => r.fulfill({ json: faxStatus === "waiting" ? { status: "waiting" } : { status: faxStatus, subject: faxStatus === "confirmed" ? "Successful Transmission" : "Fax failed: busy", at: new Date().toISOString() } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(`${baseUrl}/map/?bids=1`, { waitUntil: "load", timeout: 180000 });
  await openBidList(page);
  await page.locator('[data-hpd-smoke="fc-bids-list"] ol > li > button:first-child').first().click();
  const sheet = page.locator('[data-hpd-smoke="fc-bid-sheet"]');
  await sheet.locator('[data-hpd-smoke="fc-bid-price"]').fill("980");
  await sheet.locator('[data-hpd-smoke="fc-bid-save"]').click();
  await sheet.locator('[data-hpd-smoke="fc-bid-done"]').waitFor({ timeout: 60000 });
  const track = sheet.locator('[data-hpd-smoke="fc-faxtrack"]');
  await track.waitFor();
  const status = (k) => track.locator(`[data-hpd-smoke="fc-faxtrack-${k}"]`).getAttribute("data-status");
  assert.equal(await status("package"), "done");
  assert.equal(await status("humblefax"), "todo");
  const send = sheet.locator('[data-hpd-smoke="fc-bid-send"]');
  await send.click();
  assert.match(await send.getAttribute("class"), /is-armed/, "the second tap pulses");
  await send.click();
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-faxtrack-humblefax"]')?.getAttribute("data-status") === "now");
  assert.match(await send.getAttribute("class"), /hpd-sending/);
  await track.scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: `${shots}/faxtrack-1-sending.png` });
  await page.clock.runFor(3000);
  await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-faxtrack-faxing"]')?.getAttribute("data-status") === "now", null, { timeout: 15000 });
  assert.equal(await status("humblefax"), "done");
  assert.match(await track.locator('[data-hpd-smoke="fc-faxtrack-faxing"]').innerText(), /\(212\) 863-8655/);
  if (shots) await page.screenshot({ path: `${shots}/faxtrack-2-faxing.png` });
  // HumbleFax confirms (checked every minute).
  faxStatus = "confirmed";
  // One second at a time, so the 1.8 s celebration is seen when it plays.
  let burst = false;
  for (let i = 0; i < 75 && !burst; i++) { await page.clock.runFor(1000); burst = (await track.locator('[data-hpd-smoke="fc-faxtrack-burst"]').count()) > 0; }
  assert.ok(burst, "check + confetti when HumbleFax confirms");
  assert.equal(await status("received"), "done");
  if (shots) await page.screenshot({ path: `${shots}/faxtrack-3-received.png` });
  assert.deepEqual(errors, []);
  console.log("PASS fax tracker: package ready ✓ -> Send (2nd tap pulses) -> 'Sent to HumbleFax' spins then ✓ -> 'Faxing HPD (212) 863-8655' spins -> HumbleFax confirms -> 'HPD received' ✓ with check + confetti");
  await c.close();
} finally {
  await browser.close();
}
