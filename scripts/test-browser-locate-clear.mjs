// "Locate button still overlap on map" (owner, 23 Nov): on the iPhone map the "Couldn't get your location" line and the
// "🔨 Working at…" banner ran under the Locate button. Checks at iPhone size: the location-error line, a long
// "Working at" banner and the map hints column never touch Map style, Locate or + / −.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
    // No location permission: tapping Locate shows the "Couldn't get your location" line.
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, serviceWorkers: "block", permissions: [] });
    await routePrivate(context);
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    await context.addInitScript(() => {
      const fail = (_ok, err) => setTimeout(() => err && err({ code: 1, message: "denied" }), 50);
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: fail, watchPosition: (a, b) => { fail(a, b); return 1; }, clearWatch: () => {} } });
      Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148" });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.locator('[data-hpd-smoke="fc-more-open"]').waitFor({ timeout: 60000 });
    for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
    await page.locator('[aria-label="Locate me"]').click();
    await page.locator(".fc-map-hint-warn").first().waitFor({ timeout: 10000 });
    // A long "Working at" banner, built like the app's own (the real one needs a phone standing at a job).
    await page.evaluate(() => {
      const host = document.querySelector(".fc-map-controls")?.parentElement || document.body;
      const wrap = document.createElement("div");
      wrap.className = "fc-onsite-wrap";
      wrap.setAttribute("data-test", "onsite");
      wrap.innerHTML = '<button type="button" class="fc-onsite"><b>🔨 Working at ER03395 · since 10:14 AM</b><span>2110 WESTBURY COURT, BROOKLYN · Replace the broken window guards in the bedroom</span><small>Next: ER03623 · 73 EASTERN PARKWAY · 1.2 mi · ~6 min</small></button><button type="button" class="fc-onsite-x">✕<small>I left</small></button>';
      host.appendChild(wrap);
    });
    const bad = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect();
      const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const buttons = [...document.querySelectorAll('[aria-label="Locate me"], [data-hpd-smoke="fc-map-style"], .fc-map-zoom')].filter((e) => box(e).width > 0);
      const others = [...document.querySelectorAll(".fc-map-hint, .fc-onsite, .fc-onsite-x, .fc-wx-row > *, .fc-jobs-kept")].filter((e) => box(e).width > 0);
      const out = [];
      for (const o of others) for (const b of buttons) if (hit(box(o), box(b))) out.push(`"${o.textContent.trim().slice(0, 30)}" on ${b.getAttribute("aria-label") || b.className}`);
      return { out, buttons: buttons.length, others: others.length };
    });
    assert.ok(bad.buttons >= 2, "Map and Locate buttons on the map");
    assert.ok(bad.others >= 2, "location line and Working banner shown");
    assert.deepEqual(bad.out, [], `${viewport.width}px: ${bad.out.join("; ")}`);
    // "Plus and minus button overlap the locate me icon" (owner, 23 Nov): + / − stay under Map / Locate in every map state
    // (the column moves down when the top bar or the controls open).
    const states = ["notch fc-full-map", "notch", "", "fc-full-map", "fc-full-map fc-chrome-open", "fc-full-map fc-chrome-open fc-controls-open", "fc-chrome-open fc-controls-open"];
    const app0 = await page.evaluate(() => document.querySelector(".fc-app")?.className || "");
    for (const extra of states) {
      await page.evaluate(([base, add]) => {
        const a = document.querySelector(".fc-app");
        a.className = base;
        for (const c of ["fc-full-map", "fc-chrome-open", "fc-controls-open"]) a.classList.remove(c);
        for (const c of add.split(" ").filter((x) => x && x !== "notch")) a.classList.add(c);
        // An iPhone notch pushes the Map / Locate column down by the safe area (about 59 px); the test browser has none.
        document.getElementById("notch")?.remove();
        if (add.includes("notch")) { const st = document.createElement("style"); st.id = "notch"; st.textContent = ".fc-app .fc-map-controls { margin-top: 59px; }"; document.head.appendChild(st); }
      }, [app0, extra]);
      await page.waitForTimeout(700);
      const clash = await page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect();
        const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const col = [...document.querySelectorAll('[aria-label="Locate me"], [data-hpd-smoke="fc-map-style"]')].filter((e) => box(e).width > 0);
        const zoom = [...document.querySelectorAll(".fc-map-zoom button")].filter((e) => box(e).width > 0);
        return { n: zoom.length, out: zoom.flatMap((z) => col.filter((c) => hit(box(z), box(c))).map((c) => `${z.getAttribute("aria-label")} on ${(c.getAttribute("aria-label") || "").slice(0, 12)}`)) };
      });
      assert.equal(clash.n, 2, "+ and − on the map");
      assert.deepEqual(clash.out, [], `${viewport.width}px [${extra || "plain"}]: ${clash.out.join("; ")}`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: Locate clear at ${viewport.width}px (${bad.others} items checked against ${bad.buttons} buttons)`);
    await context.close();
  }
} finally {
  await browser.close();
}
