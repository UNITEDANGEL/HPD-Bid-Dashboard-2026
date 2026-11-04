// 💡 Ideas from Claude + 💬 talk to Claude (owner, 3 Nov: "a button I push and it recommends a bunch of suggestions, then
// we go from there ... keep upgrading") at iPhone size, status server faked. 1) 🤖 opens Your requests with the ideas
// on top; 👍 Do it sends that idea as a request and it leaves the list; Not now hides one. 2) 🔁 Keep upgrading saves
// AUTO-UPGRADE on. 3) The chat: "give me ideas" lists 3 numbered, "do idea 1" sends it, "more ideas" asks Claude.
// 4) While Claude works, 💬 on the live card: a chip goes to the open request as your answer.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const overrides = { "CLAUDE-HEARTBEAT": { at: ago(60), every: 9 } };
const posted = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { const b = r.request().postDataJSON(); posted.push(b); overrides[b.key] = { ...(overrides[b.key] || {}), ...b.patch }; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  const page = await c.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("hpd-claude-card", "big"); } catch { /* private mode */ } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const requests = () => posted.filter((b) => String(b.key).startsWith("CHANGE-REQUEST-")).map((b) => b.patch.text);

  // 1) 💡 Ideas on top of Your requests.
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-requests"]').click();
  const idea = page.locator('[data-hpd-smoke="fc-idea"]');
  await idea.first().waitFor({ timeout: 15000 });
  const n0 = await idea.count();
  assert.ok(n0 >= 3, `ideas shown: ${n0}`);
  const firstTitle = (await idea.first().locator("b").innerText()).replace(/^\S+\s/, "").replace(/ · check-up$/, "");
  const id1 = await idea.first().getAttribute("data-id");
  await idea.first().locator('[data-hpd-smoke="fc-idea-do"]').click();
  await page.waitForFunction(() => /Sent to Claude/.test(document.querySelector('[data-hpd-smoke="fc-ideas-note"]')?.textContent || ""), null, { timeout: 10000 });
  assert.ok(requests()[0].startsWith(`(idea) ${firstTitle}: `), requests()[0]);
  const id2 = await idea.first().getAttribute("data-id");
  await idea.first().locator('[data-hpd-smoke="fc-idea-skip"]').click();
  const left = await idea.evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  assert.ok(id1 !== id2 && !left.includes(id1) && !left.includes(id2), "the picked and the skipped one leave the list");
  // 2) Keep upgrading.
  await page.locator('[data-hpd-smoke="fc-auto-upgrade"]').click();
  assert.equal(await page.locator('[data-hpd-smoke="fc-auto-upgrade"]').getAttribute("aria-pressed"), "true");
  assert.equal(posted.find((b) => b.key === "AUTO-UPGRADE")?.patch.on, true);
  await page.locator('[data-hpd-smoke="fc-auto-upgrade-note"]').waitFor();
  await page.locator('[data-hpd-smoke="fc-auto-upgrade-status"]').waitFor();
  assert.match(await page.locator('[data-hpd-smoke="fc-auto-status"]').innerText(), /Keep upgrading: ON ✓/, "ON shows first thing on the screen");
  assert.equal(await page.locator('[data-hpd-smoke="fc-claude-orb-auto"]').count(), 1, "🔁 on the Claude button");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/ideas.png` }).catch(() => {});
  await page.locator('[data-hpd-smoke="fc-whatsnew"] header button').first().click();
  // 💡 in the chat bar opens the ideas any time.
  await page.locator('[data-hpd-smoke="fc-chatbar-ideas"]').click();
  await page.locator('[data-hpd-smoke="fc-ideas-more"]').waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="fc-whatsnew"] header button').first().click();

  // 3) The chat.
  const say = async (text, re) => {
    if (await page.locator('[data-hpd-smoke="fc-chatbar-input"]').isVisible()) {
      await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
      await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    } else {
      if (!(await page.locator('[data-hpd-smoke="fc-agent-type-input"]').isVisible())) await page.locator('[data-hpd-smoke="fc-agent-type-btn"]').click();
      await page.locator('[data-hpd-smoke="fc-agent-type-input"]').fill(text);
      await page.locator('[data-hpd-smoke="fc-agent-type-send"]').click();
    }
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 15000 });
    return page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();
  };
  const list = await say("give me ideas", /top ideas/);
  assert.match(list, /1\. .+\n2\. .+\n3\. /);
  const one = list.match(/1\. \S+ ([^:]+):/)[1];
  await say("do idea 1", /Sent to Claude/);
  assert.ok(requests().slice(-1)[0].startsWith(`(idea) ${one}:`), requests().slice(-1)[0]);
  await say("more ideas", /asked Claude for more ideas/);
  assert.equal(new Set(posted.filter((b) => String(b.key).startsWith("CHANGE-REQUEST-")).map((b) => b.key)).size, requests().length, "each request has its own key");
  assert.match(requests().slice(-1)[0], /^\(idea\) Give me more upgrade ideas/);
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  const before = requests().length;
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-more-ideas-more"]').click();
  await page.locator('[data-hpd-smoke="fc-ideas-note"]').waitFor({ timeout: 10000 });
  assert.equal(requests().length, before + 1, "More ideas row in the All menu asks Claude");
  await page.getByRole("button", { name: "Close", exact: true }).first().click();

  // 4) 💬 on the live card while Claude works on a request.
  overrides["CHANGE-REQUEST-20261103190000"] = { at: ago(300), text: "(idea) Quiet hours for alerts" };
  overrides["CHANGE-REPLY-20261103190000"] = { status: "Working on it", workingAt: ago(60), steps: [{ text: "Build", done: false }], updates: [{ at: ago(60), text: "On it." }] };
  overrides["CLAUDE-NOW"] = { at: ago(5), text: "Changing the screen", task: "Quiet hours", state: "working", log: [] };
  const talk = page.locator('[data-hpd-smoke="fc-claude-talk-open"]');
  await page.waitForFunction(() => /Quiet hours for alerts/.test(document.querySelector('[data-hpd-smoke="fc-claude-live"]')?.textContent || ""), null, { timeout: 30000 });
  await talk.click();
  await page.locator('[data-hpd-smoke="fc-claude-talk-chip"]', { hasText: "Do this one first" }).click();
  await page.locator('[data-hpd-smoke="fc-claude-talk-sent"]').waitFor({ timeout: 10000 });
  const ans = posted.filter((b) => b.key === "CHANGE-ANSWER-20261103190000").slice(-1)[0];
  assert.match(ans?.patch?.answers?.slice(-1)[0]?.text || "", /Do this one first/);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/claude-talk.png` }).catch(() => {});
  assert.deepEqual(errors, []);
  console.log(`PASS ideas: ${n0} ideas on top of Your requests; 👍 sent "${firstTitle}" as a request, Not now hid one; 🔁 Keep upgrading saved on; chat "give me ideas" -> 3 numbered, "do idea 1" sent "${one}", "more ideas" asked Claude; 💬 on the live card -> "Do this one first" went to the open request`);
} finally {
  await browser.close();
}
