// The 🎤 in the search box, every kind of thing the owner says (owner, 22 Oct: "mic button, test all, make sure it's
// working, like 'which jobs have I won today'; right now it's hidden behind All / MN / Brooklyn…"), at iPhone size on
// real data, said through the mic (a stand-in recognizer hears each sentence): every sentence gets the right answer
// on screen and out loud, and nothing it shows is covered by the borough buttons.
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
  await c.route(/\/api\/drive\/hpd-ask/, (r) => { const q = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ json: { ai: true, text: `About "${q.question}": you have ${q.facts.notices.length} notices open.` } }); });
  await c.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); };
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() { setTimeout(() => { this.onresult?.({ results: [Object.assign([{ transcript: window.__hear || "" }], { isFinal: true })] }); this.onend?.(); }, 150); }
      stop() { this.onend?.(); }
    };
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.waitForTimeout(1500);
  const mic = page.locator('[data-hpd-smoke="fc-search-mic"]');
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const boroughBottom = async () => { const b = await page.locator('[data-hpd-smoke="fc-borough-bar"]').boundingBox(); return b ? b.y + b.height : 0; };
  const say = async (sentence, expect) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    await page.evaluate((s) => { window.__hear = s; window.__said = []; }, sentence);
    await mic.click();
    try { await page.waitForFunction((re) => new RegExp(re).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), expect.source, { timeout: 20000 }); } catch (e) { throw new Error(`"${sentence}": got "${await reply.innerText().catch(() => "(no answer panel)")}" / search box "${await page.locator('[data-hpd-smoke="fc-search"]').inputValue()}"`); }
    await page.waitForFunction(() => window.__said.length > 0, null, { timeout: 5000 });
    return (await reply.innerText()).trim();
  };
  const results = [];
  results.push(["which jobs have I won today", await say("which jobs have I won today", /^(You won \d+ jobs? today|No awards today yet)/)]);
  // The phone heard "won" as "want" (owner, 22 Oct) and asked for the descriptions too.
  results.push(["which jobs I want today read me the description", await say("which jobs I want today read me the description", /^(You won \d+ jobs? today\. .+, .+\.|No awards today yet)/)]);
  results.push(["what did I win this week",await say("what did I win this week", /^(You won \d+ jobs? this week|No awards this week yet)/)]);
  // Plan the day, then go to the first stop.
  results.push(["plan my day", await say("plan my day", /^Your day: \d+ stops?\. First .+\. Say "take me to the next stop"/)]);
  const firstStop = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-today-route-v1") || "{}").ids?.[0] || "");
  assert.match(firstStop, /^[A-Z]{2}\d{5}$/, "a route is planned");
  results.push(["take me to the next stop", await say("take me to the next stop", new RegExp(`\\(${firstStop}\\)\\. Pick Waze or Google\\.$`))]);
  results.push(["read me the new bids",await say("read me the new bids", /^(You have \d+ open invitations? to bid|No open invitations)/)]);
  results.push(["what do I have today", await say("what do I have today", /^(Today: |Nothing urgent today)/)]);
  results.push(["which notices are open", await say("which notices are open", /notice|No notices/)]);
  results.push(["how many notices do I have?", await say("how many notices do I have?", /^About "how many notices do I have\?": you have \d+ notices open\./)]);
  // A job: finished -> asked -> yes.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const omo = await page.locator('[data-hpd-smoke="fc-jobs-row"]').first().getAttribute("data-omo");
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  results.push([`I finished ${omo}`, await say(`I finished ${omo.split("").join(" ")}`, new RegExp(`job ${omo}, as work completed\\? Say yes`))]);
  results.push(["yes", await say("yes", /^Saved\./)]);
  // Read the job on screen.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-row"] button').nth(1).click();
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  await page.locator(".fc-job-sheet-close").click();
  // Doing things by voice (in-app request 22 Oct: "I should be able to talk and get everything done").
  // A job from the To do list (the list may still be open from the step above).
  if (!(await page.locator('[data-hpd-smoke="fc-jobs"]').count())) await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-tab-todo"]').click();
  const todo = await page.locator('[data-hpd-smoke="fc-jobs-row"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-omo")));
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  results.push([`open job ${todo[1]}`, await say(`open job ${todo[1].split("").join(" ")}`, /^Here's /)]);
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  assert.match(await page.locator("#fc-job-card").innerText(), new RegExp(todo[1]));
  const hasPhone = (await page.locator('[data-hpd-smoke="jc-text-tenant"]').count()) > 0;
  if (hasPhone) {
    results.push(["call the tenant", await say("call the tenant", / Tap Call\.$/)]);
    assert.match(await page.locator('[data-hpd-smoke="fc-agent-action"]').first().getAttribute("href"), /^tel:/);
    results.push(["text the tenant", await say("text the tenant", /^I wrote a text for /)]);
    await page.locator('[data-hpd-smoke="jc-tenant-draft"]').waitFor({ timeout: 10000 });
  }
  results.push([`navigate to ${todo[1]}`, await say(`navigate to ${todo[1].split("").join(" ")}`, /Pick Waze or Google\.$/)]);
  const nav = await page.locator('[data-hpd-smoke="fc-agent-action"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  assert.ok(/waze\.com/.test(nav[0]) && /google\.com\/maps/.test(nav[1]), "Waze and Google for that job");
  results.push(["do the paperwork for this job", await say("do the paperwork for this job", /Tap Open the paperwork\.$/)]);
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-action"]').first().getAttribute("href"), /^\/paperwork\/?\?job=/);
  results.push(["I'm here",await say("I'm here", new RegExp(`^Start .+, job ${todo[1]}\\? Say yes`))]);
  results.push(["yes", await say("yes", /^Started\. You're at /)]);
  // (Finishing EQ… earlier opened its package sheet, as it should: close it, then the card.)
  await page.waitForTimeout(7000); // its countdown
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { for (const sel of ['[data-hpd-smoke="fc-package-sheet-back"]', ".fc-job-sheet-close", '[data-hpd-smoke="fc-agent-close"]']) document.querySelector(sel)?.click(); });
    await page.waitForTimeout(500);
    if (!(await page.locator('[data-hpd-smoke="fc-package-sheet"], #fc-job-card').count())) break;
  }

  // "Reply to Lewis": the board opens on her notice with the reply being written (sending still takes two taps).
  const lewis = await say("reply to Lewis", /^(Here's .+\. The AI is writing the reply|Which one\?|No notice from vendor tracking)/);
  results.push(["reply to Lewis", lewis]);
  if (/^Here's/.test(lewis)) {
    await page.locator('[data-hpd-smoke="fc-board-reply-box"]').waitFor({ timeout: 15000 });
    assert.match(await page.locator('[data-hpd-smoke="fc-board-reply-send"]').innerText(), /^✉ Send$/, "not sent: the first tap only arms");
    await page.locator('[data-hpd-smoke="fc-board-close"]').click();
  }
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // A search: the list shows and nothing in it is covered by the borough buttons.
  await page.evaluate(() => { window.__hear = "mini split"; });
  await mic.click();
  const find = page.locator('[data-hpd-smoke="fc-find"]');
  await find.waitFor({ timeout: 20000 });
  await find.locator('[data-hpd-smoke="fc-find-row"]').first().waitFor({ timeout: 20000 });
  const fb = await find.boundingBox();
  assert.ok(fb.y >= (await boroughBottom()) - 1, `the results start below the borough buttons (${Math.round(fb.y)} vs ${Math.round(await boroughBottom())})`);
  if (shots) await page.screenshot({ path: `${shots}/mic-search.png` });
  results.push(["mini split", (await find.innerText()).split("\n").slice(0, 2).join(" ")]);
  assert.deepEqual(errors, []);
  for (const [s, r] of results) console.log(`  🎤 "${s}" -> ${r.slice(0, 110)}`);
  console.log(`PASS mic: ${results.length} sentences said through the 🎤 (wins today / this week, bids, today, notices, a free question, I finished + yes, a search) each answered on screen and out loud; the search list is below the borough buttons`);
  await c.close();
} finally {
  await browser.close();
}
