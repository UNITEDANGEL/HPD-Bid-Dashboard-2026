// Signing in from the iPhone Home Screen app (owner, 22 Oct: "why 0 all"): in the Home Screen app, "Sign in with
// Google" on the board carries a one-time code (Google opens in a separate sheet whose cookies the app never sees);
// back in the app it claims the sign-in with that code and reloads. In a normal browser tab nothing changes.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const homeScreen of [true, false]) {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    if (homeScreen) await c.addInitScript(() => { const real = window.matchMedia.bind(window); window.matchMedia = (q) => (/display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : real(q)); });
    await c.route(/\/api\/private\//, (r) => r.fulfill({ status: 401, json: { error: "Sign in" } }));
    await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    let started = "";
    await c.route(/\/api\/drive\/start/, (r) => { started = r.request().url(); return r.fulfill({ status: 200, contentType: "text/html", body: "<p>Google sign-in (stand-in)</p>" }); });
    const claims = [];
    await c.route(/\/api\/drive\/claim/, (r) => { claims.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ json: { claimed: true, connected: true } }); });
    const page = await c.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1&board=1`, { waitUntil: "load", timeout: 180000 });
    const locked = page.locator('[data-hpd-smoke="fc-board-locked"]');
    await locked.waitFor({ timeout: 60000 });
    await locked.locator("button").click();
    await page.waitForFunction(() => /stand-in/.test(document.body.textContent || ""), null, { timeout: 15000 });
    const code = new URL(started).searchParams.get("handoff");
    if (!homeScreen) {
      assert.equal(code, null, "a normal tab signs in as before");
      await c.close();
      continue;
    }
    assert.match(code || "", /^[A-Za-z0-9_-]{43}$/, "the Home Screen app sends a one-time code");
    assert.match(new URL(started).searchParams.get("back") || "", /board=1/);
    // Back in the app: it claims the sign-in with that code and reloads.
    await page.goto(`${baseUrl}/map/?view=all&map=1&board=1`, { waitUntil: "load" });
    await page.waitForFunction(() => !localStorage.getItem("hpd-signin-handoff"), null, { timeout: 20000 });
    assert.ok(claims.some((x) => x.handoff === code), "claimed with the same code");
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS sign-in handoff (phone): the Home Screen app's Sign in with Google carries a one-time code and claims the sign-in when back; a normal tab is unchanged");
} finally {
  await browser.close();
}
