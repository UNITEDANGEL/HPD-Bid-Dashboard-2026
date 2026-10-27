// "🆕 New update includes…" (27 Oct, owner: "prompt me on every upgrade") at iPhone size: a phone that opened the app
// before sees the What's new lines it hasn't seen yet as a card; Got it -> gone, and it stays gone after a reload.
// A fresh install sees no card.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const news = await (await fetch(`${baseUrl}/data/whats-new.json`)).json();
const all = news.versions.flatMap((v) => v.items);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function open(seed) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  if (seed) await c.addInitScript((known) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-version-seen", "older"); localStorage.setItem("hpd-whatsnew-seen", JSON.stringify(known)); sessionStorage.setItem("seeded", "1"); } }, all.slice(2));
  const p = await c.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await p.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  return { c, p, errors };
}
try {
  {
    const { c, p, errors } = await open(true);
    const card = p.locator('[data-hpd-smoke="fc-newupdate"]');
    await card.waitFor({ timeout: 20000 });
    const items = await card.locator("li").allInnerTexts();
    assert.deepEqual(items, all.slice(0, 2), "only the two lines not seen yet");
    assert.match(await card.innerText(), /🆕 New update includes/);
    if (shots) await p.screenshot({ path: `${shots}/newupdate.png` });
    await card.locator('[data-hpd-smoke="fc-newupdate-ok"]').click();
    assert.equal(await card.count(), 0);
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    await p.waitForTimeout(2500);
    assert.equal(await card.count(), 0, "seen: not shown again");
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    const { c, p, errors } = await open(false);
    await p.waitForTimeout(2500);
    assert.equal(await p.locator('[data-hpd-smoke="fc-newupdate"]').count(), 0, "fresh install: no card");
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log(`PASS new update card: 2 unseen What's new lines -> "🆕 New update includes" with just those; Got it -> gone, also after a reload; a fresh install sees none`);
} finally {
  await browser.close();
}
