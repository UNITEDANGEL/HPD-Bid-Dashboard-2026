// ✅ Do all + 🗓 plan my week + 🌆 one evening wrap + 🔁 one greeting across phones (owner, 5 Nov: "do all ... ask me in
// the app to say do all ... stick to the plan"), at iPhone size, status server faked.
// 1) The map asks "📋 Next on the plan" with the plan's items; ✅ Do all sends ONE request "(plan) Do all, in order ..."
//    and the card goes away; saying "do all" again doesn't send it twice.
// 2) "plan my week": 7 days, each with its work (or Free). 3) "wrap up my day": the done / told you / coming up boxes.
// 4) What was said goes to the server as SAID-TODAY (no tenant data); a second phone that reads it doesn't start over.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const fake = (overrides, posted) => async (r) => {
  if (r.request().method() === "POST") { const b = r.request().postDataJSON(); posted.push(b); overrides[b.key] = { ...(overrides[b.key] || {}), ...b.patch }; return r.fulfill({ json: { ok: true } }); }
  return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
};
const open = async (overrides, posted) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, fake(overrides, posted));
  await c.addInitScript(() => {
    try { localStorage.setItem("hpd-test-plan", "1"); localStorage.setItem("hpd-test-said-sync", "1"); } catch { /* private mode */ }
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend?.(), 30); };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  return { c, page, errors };
};
const say = async (page, text) => {
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click({ timeout: 1500 }).catch(() => {});
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
};
const reply = (page) => page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
try {
  const overrides = { "CLAUDE-HEARTBEAT": { at: new Date().toISOString(), every: 9 } };
  const posted = [];
  const { c, page, errors } = await open(overrides, posted);
  const plan = (await (await fetch(`${baseUrl}/data/upgrade-ideas.json`)).json()).plan;
  assert.ok(plan?.id && plan.items.length >= 2, "upgrade-ideas.json has the next plan items");

  // 1) 📋 Next on the plan, on the map.
  const card = page.locator('[data-hpd-smoke="fc-plan-card"]');
  await card.waitFor({ timeout: 15000 });
  const shown = await card.innerText();
  for (const x of plan.items) assert.ok(shown.includes(x.title), `the card lists ${x.title}`);
  await card.locator('[data-hpd-smoke="fc-plan-doall"]').click();
  await card.waitFor({ state: "detached", timeout: 5000 });
  const requests = () => posted.filter((b) => String(b.key).startsWith("CHANGE-REQUEST-")).map((b) => b.patch.text);
  await page.waitForFunction(() => true);
  for (let i = 0; i < 50 && !requests().length; i++) await page.waitForTimeout(100);
  assert.equal(requests().length, 1, "one request");
  assert.match(requests()[0], /^\(plan\) Do all, in order \(/);
  plan.items.forEach((x, i) => assert.ok(requests()[0].includes(`${i + 1}. ${x.title}: `), `item ${i + 1} in order`));
  await say(page, "do all");
  await page.waitForFunction(() => /You already said do all/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 5000 });
  assert.equal(requests().length, 1, "not sent twice");

  // 2) 🗓 Plan my week.
  await say(page, "plan my week");
  await page.locator('[data-hpd-smoke="fc-weekplan"]').waitFor({ timeout: 8000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-weekplan-day"]').count(), 7, "7 days");
  assert.equal(await page.locator('[data-hpd-smoke="fc-weekplan-day"] b').first().innerText(), "Today");
  assert.match(await reply(page), /^🗓 Your week, planned:\n• Today: /);

  // 3) 🌆 Wrap up the day: the same three boxes.
  await say(page, "wrap up my day");
  await page.waitForFunction(() => /^Today you /.test((document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").trim()), null, { timeout: 8000 });
  await page.locator('[data-hpd-smoke="fc-recap"]').waitFor({ timeout: 5000 });
  for (const part of ["fc-recap-done", "fc-recap-reminded", "fc-recap-later"]) assert.equal(await page.locator(`[data-hpd-smoke="${part}"]`).count(), 1, part);

  // 4) 🔁 What was said went to the server (a few seconds later), without tenant names or phones.
  for (let i = 0; i < 80 && !posted.some((b) => b.key === "SAID-TODAY"); i++) await page.waitForTimeout(100);
  const sent = posted.filter((b) => b.key === "SAID-TODAY").pop();
  assert.ok(sent, "SAID-TODAY sent");
  assert.equal(sent.patch.day, today);
  assert.ok(sent.patch.said.some((s) => s.key === `wrap:${today}`), "the wrap is remembered");
  for (const s of sent.patch.said) assert.match(s.key, /^(bids|notice|part|wrap|job|first):/, s.key);
  assert.doesNotMatch(JSON.stringify(sent.patch), /\(\d{3}\)|\d{3}[ -]\d{3}[ -]\d{4}/, "no phone numbers");
  assert.deepEqual(errors, []);
  await c.close();

  // The second phone reads it: the brief and the reminders are already said.
  const o2 = { "SAID-TODAY": { day: today, briefAt: Date.now() - 3600000, said: [{ key: "notice:ZZ99999", text: "notice ZZ99999 overdue", at: Date.now() - 3600000 }] } };
  const p2 = await open(o2, []);
  await p2.page.waitForFunction(() => { try { const l = JSON.parse(localStorage.getItem("hpd-said-v1") || "{}"); return (l.said || []).some((s) => s.key === "notice:ZZ99999"); } catch { return false; } }, null, { timeout: 15000 });
  const log = await p2.page.evaluate(() => JSON.parse(localStorage.getItem("hpd-said-v1")));
  assert.equal(log.day, today);
  assert.ok(log.briefAt > 0 && log.briefAt <= o2["SAID-TODAY"].briefAt, "the morning brief counts as said on this phone too");
  await p2.page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await p2.page.waitForFunction(() => /^Hi again, /.test((document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").trim()), null, { timeout: 6000 });
  assert.deepEqual(p2.errors, []);
  await p2.c.close();
  console.log(`PASS do all + plan: the map asks "Next on the plan" (${plan.items.length} items), ✅ Do all = one request in order, not twice; plan my week = 7 days; the evening wrap has the three boxes; SAID-TODAY to the server (no tenant data) and the second phone says "Hi again"`);
} finally {
  await browser.close();
}
