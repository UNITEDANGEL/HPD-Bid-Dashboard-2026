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
  if (seed) await c.addInitScript((known) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("hpd-version-seen", "older"); localStorage.setItem("hpd-side-open", "0"); localStorage.setItem("hpd-whatsnew-seen", JSON.stringify(known)); sessionStorage.setItem("seeded", "1"); } }, all.slice(2));
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
    await p.waitForTimeout(900); // it slides in (0.6 s)
    assert.equal(await p.locator('[data-hpd-smoke="fc-magic-timer"]').count(), 1, "10 s bar shows");
    await card.dispatchEvent("pointerdown"); // hold it open (it leaves by itself after 10 s; block 2 checks that)
    // 26 Nov: up to 3 cards, each with its own big icon and the first sentence.
    const items = await card.locator("li").evaluateAll((els) => els.map((e) => [e.querySelector(".fc-magic-ico")?.textContent || "", e.lastElementChild?.textContent || ""]));
    const short = (x) => { const one = x.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0]; const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*/u.exec(one); const w = m ? one.slice(m[0].length) : one; return [m ? m[1] : "✨", w.length > 110 ? `${w.slice(0, 108)}…` : w]; };
    assert.deepEqual(items, all.slice(0, 2).map(short), "only the lines not seen yet (2 here), first sentence each, icon apart");
    assert.match(await card.innerText(), /Swipe it away/);
    assert.match(await card.innerText(), /🆕 New update includes/);
    // ✨ Magic popup (24 Nov): it jumps up in the middle even with the side tab closed, over a sparkle backdrop.
    assert.match(await card.innerText(), /New upgrade is live!/);
    assert.equal(await p.locator('[data-hpd-smoke="fc-magic-backdrop"]').count(), 1, "sparkle backdrop");
    const mid = await card.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: window.innerHeight, left: r.left, right: r.right, w: window.innerWidth }; });
    assert.ok(mid.top > 0 && mid.bottom < mid.h && mid.left >= 0 && mid.right <= mid.w, `popup fully on screen: ${JSON.stringify(mid)}`);
    // Nothing on top of it (24 Nov: the red notices bar and the black 24 / 72 h bar covered it): put both bars on the page
    // and tap-test points across the popup.
    const covered = await card.evaluate((el) => {
      const bars = ["fc-notice-tray", "fc-notice-chooser"].map((k) => { const d = document.createElement("div"); d.className = k; d.style.cssText = "top:0;bottom:0;left:0;right:0;height:100vh"; document.querySelector(".fc-app")?.appendChild(d); return d; });
      const r = el.getBoundingClientRect(); const bad = [];
      for (const fy of [0.2, 0.5, 0.8]) for (const fx of [0.2, 0.5, 0.8]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const hit = document.elementFromPoint(x, y); if (!el.contains(hit)) bad.push(`${Math.round(x)},${Math.round(y)}: ${hit?.className}`); }
      bars.forEach((d) => d.remove()); return bad;
    });
    assert.deepEqual(covered, [], "the New update popup sits over the notices bars");
    if (shots) await p.screenshot({ path: `${shots}/newupdate.png` });
    await card.locator('[data-hpd-smoke="fc-newupdate-ok"]').click();
    assert.equal(await card.count(), 0);
    assert.equal(await p.locator('[data-hpd-smoke="fc-magic-backdrop"]').count(), 0, "backdrop gone too");
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
  {
    // 25 Nov (owner: "double messages pop-up for updates ... go in and go out by itself, like 10 seconds"): left alone, it
    // slides away by itself after about 10 s, the small "✨ App updated" note doesn't follow it, and a reload doesn't bring it back.
    const { c, p, errors } = await open(true);
    const card = p.locator('[data-hpd-smoke="fc-newupdate"]');
    await card.waitFor({ timeout: 20000 });
    const t0 = Date.now();
    await card.waitFor({ state: "detached", timeout: 15000 });
    const took = Date.now() - t0;
    assert.ok(took > 7000, `left by itself after about 10 s, not too early (${took} ms)`);
    assert.equal(await p.locator('[data-hpd-smoke="fc-magic-backdrop"]').count(), 0, "sparkles gone too");
    await p.evaluate(() => localStorage.setItem("hpd-side-open", "1"));
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    await p.waitForTimeout(2500);
    assert.equal(await card.count(), 0, "shown once: not again after a reload");
    assert.equal(await p.locator('[data-hpd-smoke="fc-updated-banner"]').count(), 0, "no second 'App updated' note");
    assert.deepEqual(errors, []);
    await c.close();
  }
  {
    // A tap on it keeps it open (the owner is reading), and the 10 s bar goes away.
    const { c, p } = await open(true);
    const card = p.locator('[data-hpd-smoke="fc-newupdate"]');
    await card.waitFor({ timeout: 20000 });
    await p.waitForTimeout(900);
    await card.locator("strong").tap();
    await p.waitForTimeout(11000);
    assert.equal(await card.count(), 1, "tapped: stays");
    assert.equal(await p.locator('[data-hpd-smoke="fc-magic-timer"]').count(), 0);
    await card.locator('[data-hpd-smoke="fc-newupdate-ok"]').click();
    assert.equal(await card.count(), 0);
    await c.close();
  }
  console.log(`PASS new update card: 2 unseen What's new lines -> "🆕 New update includes" with just those; Got it -> gone, also after a reload; a fresh install sees none; left alone it slides away after ~10 s and never shows twice; a tap keeps it`);
} finally {
  await browser.close();
}
