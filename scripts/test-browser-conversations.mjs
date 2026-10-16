// Conversations with HPD at iPhone size: HPD notices lists the email threads with HPD staff (waiting on you
// first); one opens as a chat (HPD left, you right) with Reply in Gmail; a job with emails shows "💬 Emails
// with HPD" on its card. Not signed in: says it's private. Prints no email text.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let summary = "";
try {
  for (const signedIn of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
    if (signedIn) await routePrivate(context);
    else await context.route(/\/api\/private\//, (r) => r.fulfill({ status: 401, json: { error: "Sign in with Google" } }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
    await page.locator('[data-hpd-smoke="fc-notices-open"]').click();
    const box = page.locator('[data-hpd-smoke="fc-conversations"]');
    await box.waitFor({ timeout: 15000 });
    if (!signedIn) {
      await box.locator('[data-hpd-smoke="fc-conversations-signin"]').waitFor({ timeout: 10000 });
      await context.close();
      continue;
    }
    const data = await page.evaluate(async () => (await fetch("/api/private/conversations")).json());
    const waiting = data.threads.filter((t) => t.waiting).length;
    await box.locator('[data-hpd-smoke="fc-thread-row"]').first().waitFor({ timeout: 15000 });
    assert.ok((await box.locator("h4").innerText()).toLowerCase().includes(`(${waiting} waiting on you)`), "waiting count in the heading");
    if (waiting) assert.match(await box.locator('[data-hpd-smoke="fc-thread-row"]').first().innerText(), /🔴/, "waiting ones first");
    await box.locator('[data-hpd-smoke="fc-thread-row"]').first().click();
    const viewer = page.locator('[data-hpd-smoke="fc-thread-viewer"]');
    await viewer.waitFor({ timeout: 5000 });
    const msgs = await viewer.locator('[data-hpd-smoke="fc-msg"]').count();
    assert.ok(msgs >= 1, "messages shown");
    assert.match(await viewer.locator('[data-hpd-smoke="fc-thread-gmail"]').getAttribute("href"), /^https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/[0-9a-f]+$/);
    const scroll = await viewer.locator(".fc-summary-body").evaluate((b) => getComputedStyle(b).overflowY);
    assert.match(scroll, /auto|scroll/);
    await viewer.locator('[data-hpd-smoke="fc-thread-close"]').click();
    assert.equal(await viewer.count(), 0);
    // A job with emails: the card's button opens all its threads.
    const jobs = await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json();
    const ids = new Set(jobs.map((j) => j.OMO));
    const t = data.threads.find((x) => x.omos.some((o) => ids.has(o)));
    const omo = t.omos.find((o) => ids.has(o));
    const count = data.threads.filter((x) => x.omos.includes(omo)).length;
    await page.goto(`${baseUrl}/map/?view=all&omo=${omo}`, { waitUntil: "load" });
    const btn = page.locator('[data-hpd-smoke="jc-threads"]');
    await btn.waitFor({ timeout: 60000 });
    assert.ok((await btn.innerText()).includes(`Emails with HPD (${count})`), "count on the card");
    await btn.click();
    await viewer.waitFor({ timeout: 5000 });
    assert.equal(await viewer.locator('[data-hpd-smoke="fc-thread"]').count(), count, "every thread about the job");
    assert.deepEqual(errors, []);
    summary = `${data.threads.length} threads (${waiting} waiting on you, listed first); a thread opens as a chat with ${msgs} message(s) and Reply in Gmail; ${omo}'s card shows its ${count} thread(s)`;
    await context.close();
  }
  console.log(`PASS conversations: ${summary}; not signed in it says private`);
} finally {
  await browser.close();
}
