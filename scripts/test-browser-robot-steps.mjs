// 🪜 The robot step by step (owner's picks, 4 Nov) at iPhone size: 1) a job read out loud offers "walk me through it":
// each work item one at a time, "done" goes to the next, and the end says to take the after photos. 2) "I'm running
// late" writes the tenant a text with the new time, one tap to send. 3) "give me a tour": what's new one by one, "stop" ends.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const offer = (name) => page.locator('[data-hpd-smoke="fc-agent-offer"]', { hasText: new RegExp(name, "i") });

  // 1) Walk me through the job.
  const JOB = "ER06362";
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  await page.locator('[data-hpd-smoke="jc-read"]').click();
  await offer("walk me through it").click();
  await page.waitForFunction(() => /^🔧 Item 1 of \d+: /.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  const total = Number(/of (\d+)/.exec(await reply.innerText())[1]);
  for (let i = 2; i <= total; i++) {
    await offer("^▶ Done$").click();
    await page.waitForFunction((n) => new RegExp(`^🔧 Item ${n} of `).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), i, { timeout: 5000 });
  }
  await offer("^▶ Done$").click();
  await page.waitForFunction(() => /take the after photos, then say "done"/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  assert.ok(await page.evaluate(() => window.__said.some((t) => /Item 1 of/.test(t))), "each item said out loud");

  // 2) Running late (the job just talked about).
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator(".fc-job-sheet-close").click();
  await page.locator("#fc-job-card").waitFor({ state: "detached", timeout: 5000 });
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("I'm running late");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /running a little late|no tenant phone/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  const late = await reply.innerText();
  let lateNote = "no tenant phone on file for the test job";
  if (/running a little late/.test(late)) {
    assert.match(late, /I'll be there around \d{1,2}:\d{2} (AM|PM)\./);
    const send = page.locator('[data-hpd-smoke="fc-agent-action"]', { hasText: /Send: there around/ });
    assert.match(await send.getAttribute("href"), /^sms:/);
    lateNote = "text ready with the new time";
  }
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // 3) The tour of what's new.
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("give me a tour");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /^🎬 New 1 of \d: /.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });
  await offer("^▶ Done$").click();
  await page.waitForFunction(() => /^🎬 New 2 of /.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  await offer("^▶ Stop$").click();
  await page.waitForFunction(() => /OK, stopped/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  console.log(`PASS robot steps: walked through ${total} work items with "done", then the after-photo reminder; running late: ${lateNote}; the tour goes item by item and stops`);
} finally {
  await browser.close();
}
