// 🐞 "Something's not working" (owner, 9 Nov: "Button is not working, fix it", and nobody could tell which button):
// All → Something's not working sends Claude one request with the last buttons tapped (their names, in order, with the
// screen), recent errors and the version, never what was typed; a note says it was sent. Nothing goes to HPD.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  const posts = [];
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { try { posts.push(JSON.parse(r.request().postData() || "{}")); } catch { /* not json */ } }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').waitFor({ timeout: 60000 });
  for (const ok of await page.locator('[data-hpd-smoke="fc-hpd-ping-ok"]').all()) await ok.click().catch(() => {});
  // Something typed in the search box must never be sent.
  const search = page.locator('input[type="search"], [data-hpd-smoke="fc-search"] input, input[placeholder*="Ask me"]').first();
  if (await search.count()) { await search.click(); await search.fill("secret 718 555 0199"); await search.fill(""); }
  // Tap a couple of buttons, then report.
  // All, close it, All again (the menu opens and closes on the same button).
  const row = page.locator('[data-hpd-smoke="fc-more-broken"]');
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await row.waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.waitForTimeout(300);
  if (!(await row.isVisible())) await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await row.waitFor({ timeout: 10000 });
  assert.match(await row.innerText(), /Something's not working[\s\S]*last taps/);
  await row.click();
  const note = page.locator('[data-hpd-smoke="fc-broken-note"]');
  await note.waitFor({ timeout: 10000 });
  assert.match(await note.innerText(), /Sent to Claude with your last taps/);
  const req = posts.find((p) => /^CHANGE-REQUEST/.test(p.key || ""));
  assert.ok(req, "one request for Claude");
  const text = req.patch.text;
  assert.match(text, /^🐞 Something's not working/);
  assert.match(text, /Last taps: .*All.*\(.*\)/, `the taps, with the screen: ${text}`);
  assert.match(text, /→ [^→\n]*Something's not working \([^)]*\)\n/, "the report button itself is the last tap");
  assert.match(text, /Errors in the last 30 min: /);
  assert.match(text, /Version: /);
  assert.ok(!/secret|718|555/.test(text), "nothing typed is sent");
  assert.ok(!posts.some((p) => /hpd\.nyc\.gov|fax/i.test(JSON.stringify(p))), "nothing to HPD");
  assert.deepEqual(errors, []);
  console.log(`PASS broken report: All → 🐞 Something's not working sent Claude the last taps with their screens, errors and version (no typed words), and said so`);
} finally {
  await browser.close();
}
