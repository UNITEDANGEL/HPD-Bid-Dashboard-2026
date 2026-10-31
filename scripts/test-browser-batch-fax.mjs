// One fax for several bids (owner, 31 Oct "do 4"), at iPhone size with real invitations (the fax is faked, nothing is
// sent): three bids with a price saved and not sent show "Send 3 saved bids in one fax" on the checklist; one can be
// left out; the first tap only asks; the second sends ONE fax with the two packages and a cover naming both OMOs; both
// bids are then "fax going through", and HumbleFax's one answer confirms both.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { openBidList } from "./bids-test-helpers.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const fetched = await (await fetch(`${baseUrl}/data/upcoming_bids.json`)).json();
  const ny = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const tomorrow = ny(new Date(Date.now() + 86400000)), later = ny(new Date(Date.now() + 5 * 86400000));
  // Real invitations (with their PDFs): three due tomorrow with a price saved, the rest later.
  const real = fetched.bids.filter((b) => b.itbFile).slice(0, 5);
  assert.ok(real.length >= 3, "3 real invitations with a PDF");
  const bids = real.map((b, i) => ({ ...b, bidDue: i < 3 ? tomorrow : later, bidDueTime: "11:00 AM" }));
  await context.route(/\/data\/upcoming_bids\.json/, (r) => r.fulfill({ json: { ...fetched, bids } }));
  const [a, b, c] = bids;
  const now = new Date().toISOString();
  const saved = (bid, price) => ({ omo: bid.omo, address: bid.address, borough: bid.borough, bidDue: bid.bidDue, bidDueTime: bid.bidDueTime, price, savedAt: now, status: "saved", attempts: 0, updatedAt: now });
  await context.addInitScript((recs) => { if (!localStorage.getItem("seeded")) { localStorage.setItem("seeded", "1"); localStorage.setItem("hpd-bid-records-v1", JSON.stringify(recs)); } },
    { [a.omo]: saved(a, 1450), [b.omo]: saved(b, 980), [c.omo]: saved(c, 2100) });
  const faxes = [];
  await context.route(/\/api\/drive\/fax-bid/, (r) => {
    faxes.push({ subject: decodeURIComponent(r.request().headers()["x-hpd-subject"] || ""), body: r.request().postData() || "" });
    return r.fulfill({ json: { sent: true, to: "2128638655@humblefax.com", messageId: "m1", sentAt: new Date().toISOString() } });
  });
  const checks = [];
  let answer = { status: "waiting" };
  await context.route(/\/api\/drive\/fax-status/, (r) => { checks.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: answer }); });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".fc-pin, .leaflet-marker-icon").length > 50, null, { timeout: 120000 });
  await page.locator('[data-hpd-smoke="fc-bids-open"]').click();
  await openBidList(page);
  const list = page.locator('[data-hpd-smoke="fc-checklist"]');
  await list.waitFor({ timeout: 20000 });
  const open = list.locator('[data-hpd-smoke="fc-batch-open"]');
  await open.waitFor({ timeout: 20000 });
  assert.match(await open.innerText(), /Send 3 saved bids in one fax/);
  await open.click();
  const box = list.locator('[data-hpd-smoke="fc-batch"]');
  assert.match(await box.innerText(), /One fax to HPD \(212\) 863-8655/);
  assert.match(await box.innerText(), /log each one under its own OMO/);
  // Leave the third one out.
  await box.locator(`[data-hpd-smoke="fc-batch-pick"][data-omo="${c.omo}"]`).click();
  const send = box.locator('[data-hpd-smoke="fc-batch-send"]');
  assert.match(await send.innerText(), /Send 1 fax with 2 bids/);
  await send.click();
  assert.match(await send.innerText(), /Tap again to fax 2 bids \(\$2,430\.00 in all\)/);
  assert.equal(faxes.length, 0, "the first tap only asks");
  if (shots) await page.screenshot({ path: `${shots}/batch-fax-armed.png` });
  await send.click();
  const done = list.locator('[data-hpd-smoke="fc-batch-done"]');
  try { await done.waitFor({ timeout: 90000 }); }
  catch { throw new Error(`not sent: ${await list.locator('[data-hpd-smoke="fc-batch-busy"]').innerText().catch(() => "?")}`); }
  assert.equal(faxes.length, 1, "ONE fax");
  assert.equal(faxes[0].subject, `2 BIDS - OMO ${a.omo}, ${b.omo} - United Angel Construction Corp.`);
  const pdfs = faxes[0].body.match(/filename="[^"]+\.pdf"/g) || [];
  assert.equal(pdfs.length, 2, "both bid packages attached");
  assert.ok(pdfs[0].includes(a.omo) && pdfs[1].includes(b.omo), "in the cover's order");
  assert.ok(!faxes[0].body.includes(c.omo), "the one left out isn't in it");
  assert.match(await done.innerText(), new RegExp(`1 fax with 2 bids sent .*${a.omo}, ${b.omo}`));
  const recs = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}"));
  for (const x of [a, b]) {
    assert.equal(recs[x.omo].status, "sent");
    assert.deepEqual(recs[x.omo].batch, [a.omo, b.omo]);
    assert.match(recs[x.omo].log.at(-1).what, /in one fax with/);
  }
  assert.equal(recs[c.omo].status, "saved", "the third is still to send");
  // Both are "fax going through", and the left-out one alone can't make a batch any more.
  const rowText = async (omo) => list.locator(`[data-hpd-smoke="fc-checklist-row"][data-omo="${omo}"]`).innerText();
  assert.match(await rowText(a.omo), /fax going through/);
  assert.match(await rowText(b.omo), /fax going through/);
  assert.equal(await list.locator('[data-hpd-smoke="fc-batch-open"]').count(), 0);
  if (shots) await page.screenshot({ path: `${shots}/batch-fax-sent.png` });
  // HumbleFax's answer for that fax confirms both (each check carries the fax's OMOs).
  answer = { status: "confirmed", subject: "Successful Transmission", at: new Date().toISOString() };
  await page.waitForFunction(([x, y]) => { const r = JSON.parse(localStorage.getItem("hpd-bid-records-v1") || "{}"); return r[x]?.status === "confirmed" && r[y]?.status === "confirmed"; }, [a.omo, b.omo], { timeout: 90000, polling: 1000 });
  assert.ok(checks.some((q) => q.omo === a.omo && q.omos?.join() === `${a.omo},${b.omo}`), "the check names the whole fax");
  assert.deepEqual(errors, []);
  console.log(`PASS one fax for several bids: 3 saved bids offered, one left out, 2 taps sent ONE fax (${a.omo}, ${b.omo}; cover subject names both, both packages in order), both going through, then both confirmed by one HumbleFax answer`);
} finally {
  await browser.close();
}
