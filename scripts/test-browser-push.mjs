// Phone alerts switch (20 Oct) on the Alerts page at iPhone size: in Safari (not the Home Screen app) it explains Add to
// Home Screen; in the Home Screen app "Turn on phone alerts" asks for permission, hands the phone's push address to the
// server (faked here), shows On with "Send a test alert" and "Turn off". The phone's push service is faked; nothing
// real is registered.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  // 1. Safari on the iPhone (no push in the browser tab): explains the Home Screen step.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE });
    await context.addInitScript(() => { delete window.PushManager; });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/alerts/`, { waitUntil: "load", timeout: 180000 });
    const box = page.locator('[data-hpd-smoke="fc-push"]');
    await box.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-push"]')?.getAttribute("data-state") === "need-home-screen", null, { timeout: 15000 });
    assert.match(await box.locator('[data-hpd-smoke="fc-push-homescreen"]').innerText(), /Share → Add to Home Screen/);
    await context.close();
  }
  // 2. The Home Screen app: turn on -> permission -> address to the server -> On; test alert; turn off.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE });
    await context.grantPermissions(["notifications"], { origin: new URL(baseUrl).origin });
    const posts = [];
    await context.route("**/api/drive/push-subscribe", (r) => { const b = JSON.parse(r.request().postData() || "{}"); posts.push(b); return r.fulfill({ json: { ok: true, id: "0123456789abcdef", off: b.off === true } }); });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { get: () => true });
      // The test browser always says "denied": answer like an iPhone where you tap Allow.
      let perm = "default";
      Object.defineProperty(Notification, "permission", { get: () => perm });
      Notification.requestPermission = async () => { perm = "granted"; return perm; };
      window.__shown = [];
      let sub = null;
      const fake = { endpoint: "https://web.push.apple.com/QGZha2UtcGhvbmU", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
      // The phone remembers its push address across reopening (like a real one).
      const mk = () => ({ toJSON: () => fake, unsubscribe: async () => { sub = null; sessionStorage.removeItem("fake-sub"); return true; } });
      if (sessionStorage.getItem("fake-sub")) sub = mk();
      PushManager.prototype.getSubscription = async () => sub;
      PushManager.prototype.subscribe = async (opts) => { window.__key = opts.applicationServerKey?.byteLength; sub = mk(); sessionStorage.setItem("fake-sub", "1"); return sub; };
      ServiceWorkerRegistration.prototype.showNotification = async (title, o) => { window.__shown.push(title); };
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/alerts/`, { waitUntil: "load", timeout: 180000 });
    const box = page.locator('[data-hpd-smoke="fc-push"]');
    await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-push"]')?.getAttribute("data-state") === "off", null, { timeout: 20000 });
    if (shots) await page.screenshot({ path: `${shots}/push-1-off.png` });
    await box.locator('[data-hpd-smoke="fc-push-on"]').click();
    await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-push"]')?.getAttribute("data-state") === "on", null, { timeout: 20000 });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].subscription.endpoint, "https://web.push.apple.com/QGZha2UtcGhvbmU");
    assert.equal(posts[0].device, "iPhone");
    assert.equal(await page.evaluate(() => window.__key), 65, "the app's public alert key (65 bytes)");
    assert.match(await box.locator('[data-hpd-smoke="fc-push-msg"]').innerText(), /Phone alerts are on/);
    if (shots) await page.screenshot({ path: `${shots}/push-2-on.png` });
    await box.locator('[data-hpd-smoke="fc-push-test"]').click();
    await page.waitForFunction(() => window.__shown.length === 1);
    assert.equal(await page.evaluate(() => window.__shown[0]), "HPD Field · test alert");
    // Still on after reopening.
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-push"]')?.getAttribute("data-state") === "on", null, { timeout: 20000 });
    await box.locator('[data-hpd-smoke="fc-push-off"]').click();
    await page.waitForFunction(() => document.querySelector('[data-hpd-smoke="fc-push"]')?.getAttribute("data-state") === "off", null, { timeout: 20000 });
    assert.equal(posts.at(-1).off, true, "the server is told this phone turned them off");
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS phone alerts switch: Safari on the iPhone explains Add to Home Screen; in the Home Screen app Turn on -> permission -> the phone's address to the server (with the app's key) -> On; test alert shows; stays on after reopening; Turn off tells the server");
} finally {
  await browser.close();
}
