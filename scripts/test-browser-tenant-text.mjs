// Text the tenant (owner, 22 Oct: "the AI needs to reach out to the tenant and describe the job, a text message is good;
// if they follow up, remind me to give them a call"), at iPhone size on real data: a job with a tenant phone ->
// 📱 Text tenant -> a ready text at once, the AI's version when it answers -> 📱 Open in Messages carries the number and
// the text (the owner presses Send there) -> "Texted <time> · Waiting for their answer" -> They replied -> the Call
// button lights up ("call them back"). Nothing is sent by the app itself.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  let asked = null;
  await c.route(/\/api\/drive\/hpd-ask/, (r) => { asked = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { ai: true, text: `Hi, this is Jot from United Angel Construction. HPD sent us to fix ${asked.facts.job} at ${asked.facts.address}. When can we come? Please text or call back.` } }); });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  // A to-do job with a tenant phone.
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const ids = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  let omo = "";
  for (const id of ids.slice(0, 40)) {
    if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
    await page.locator(`[data-hpd-smoke="fc-jobs-row"][data-omo="${id}"] button`).first().click();
    await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    if (await page.locator('[data-hpd-smoke="jc-text-tenant"]').count()) { omo = id; break; }
    await page.locator(".fc-job-sheet-close").click();
  }
  assert.ok(omo, "a to-do job with a tenant phone");
  await page.locator('[data-hpd-smoke="jc-text-tenant"]').click();
  const draft = page.locator('[data-hpd-smoke="jc-tenant-draft"]');
  await draft.waitFor();
  await page.waitForFunction(() => /United Angel/.test(document.querySelector('[data-hpd-smoke="jc-tenant-draft-text"]')?.value || ""), null, { timeout: 10000 });
  await page.waitForFunction(() => /Written by AI/.test(document.querySelector('[data-hpd-smoke="jc-tenant-draft"]')?.textContent || ""), null, { timeout: 10000 });
  const text = await draft.locator("textarea").inputValue();
  assert.match(text, /HPD sent us to fix/, "the AI's text");
  assert.ok(asked && !JSON.stringify(asked.facts).match(/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/), "the AI never gets the tenant's phone");
  const link = draft.locator('[data-hpd-smoke="jc-tenant-open-sms"]');
  const href = await link.getAttribute("href");
  assert.match(href, /^sms:\+?\d{10,11}[&?]body=/, "Messages with the number");
  assert.ok(decodeURIComponent(href.split("body=")[1]) === text, "and the text");
  if (shots) await page.screenshot({ path: `${shots}/tenant-text.png` });
  // Open in Messages (the test stops the phone from leaving the page): it's recorded as texted.
  await page.evaluate(() => document.addEventListener("click", (e) => { if (e.target.closest?.('[data-hpd-smoke="jc-tenant-open-sms"]')) e.preventDefault(); }, true));
  await link.click();
  const step = page.locator('[data-hpd-smoke="jc-tenant-step"]');
  await step.waitFor({ timeout: 5000 });
  assert.match(await step.innerText(), /Texted .* Waiting for their answer/);
  await page.locator('[data-hpd-smoke="jc-tenant-replied"]').click();
  await page.waitForFunction(() => /call them back/.test(document.querySelector('[data-hpd-smoke="jc-tenant-step"]')?.textContent || ""), null, { timeout: 5000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-tenant-call"]').getAttribute("class"), /is-due/, "the Call button lights up");
  assert.equal(await page.locator('#fc-job-card a', { hasText: /^Call$/ }).count(), 1, "one Call button (no duplicate)");
  assert.deepEqual(errors, []);
  console.log(`PASS tenant text: ${omo} -> AI text (no phone sent to the AI) -> Messages link with number + text -> Texted, waiting -> They replied -> Call lights up`);
  await c.close();
} finally {
  await browser.close();
}
