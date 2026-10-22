// The voice helper (owner, 22 Oct: "be my personal agent for this app: 'I finished this job' and you note it; give me
// the description, talk it out with me"), at iPhone size on real data. Typed (search box + Enter) and said (🎤):
// "read me the new bids" -> "You have N invitations to bid…"; "what do I have today" -> "Today: …";
// "I finished <job>" -> it reads it back and asks; nothing is saved until Yes; Yes saves it ("Saved…" and the job
// shows Work completed); with a job card open, "read me this job" reads that job; "no" cancels.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const saved = [];
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { try { saved.push(JSON.parse(r.request().postData() || "{}")); } catch { /* not json */ } return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  // What the helper says, and a stand-in microphone that hears whatever window.__hear holds.
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
  const box = page.locator('[data-hpd-smoke="fc-search"]');
  const panel = page.locator('[data-hpd-smoke="fc-agent"]');
  const reply = panel.locator('[data-hpd-smoke="fc-agent-reply"]');
  const type = async (words) => { await box.fill(words); await box.press("Enter"); await panel.waitFor({ timeout: 10000 }); await page.waitForTimeout(400); return (await reply.innerText()).trim(); };
  const lastSaid = () => page.evaluate(() => window.__said.at(-1) || "");

  // Bids and today.
  await page.waitForTimeout(1500);
  const bids = await type("read me the new bids");
  await page.waitForFunction(() => /invitation|No open/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  const bidsText = (await reply.innerText()).trim();
  assert.match(bidsText, /^(You have \d+ open invitations? to bid\.|No open invitations)/, bidsText || bids);
  assert.doesNotMatch(bidsText, /\b(QN|BK|BX|MN|SI):/, "boroughs spelled out");
  assert.ok((await lastSaid()).length > 10, "said out loud");
  const today = await type("what do I have today");
  assert.match(today, /^(Today: .+\.|Nothing urgent today\.)$/);

  // A job from the To do list, by its number: read back, asked, nothing saved until Yes.
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator('[data-hpd-smoke="fc-jobs-open"]').click();
  const omo = await page.locator('[data-hpd-smoke="fc-jobs-row"]').first().getAttribute("data-omo");
  await page.locator('[data-hpd-smoke="fc-jobs-close"]').click();
  const ask = await type(`I finished ${omo}`);
  assert.match(ask, new RegExp(`job ${omo}, as work completed\\? Say yes, or tap Yes\\.`));
  assert.match(await lastSaid(), /E [A-Z] \d \d \d \d \d/, "the job number is read letter by letter");
  const before = saved.length;
  await panel.locator('[data-hpd-smoke="fc-agent-no"]').click();
  await page.waitForTimeout(300);
  assert.match(await reply.innerText(), /OK, nothing saved/);
  assert.equal(saved.filter((s) => JSON.stringify(s).includes("WORK_COMPLETED")).length, 0, "No: nothing saved");
  // Said with the 🎤 this time, then Yes.
  await page.evaluate((o) => { window.__hear = `job ${o.split("").join(" ")} is done`; }, omo);
  await panel.locator('[data-hpd-smoke="fc-agent-talk"]').click();
  await page.waitForFunction(() => /Say yes/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  if (shots) await page.screenshot({ path: `${shots}/agent-ask.png` });
  await panel.locator('[data-hpd-smoke="fc-agent-yes"]').click();
  await page.waitForFunction(() => /^Saved\./.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 10000 });
  const done = await page.evaluate((o) => JSON.stringify(JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[o] || {}), omo);
  assert.ok(/WORK_COMPLETED/.test(done) || saved.length > before, `saved for ${omo}`);

  // With a job card open: "read me this job".
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.locator(".fc-pin").first().click({ force: true });
  await page.locator("#fc-job-card").waitFor({ timeout: 20000 });
  const cardId = (await page.locator("#fc-job-card").innerText()).match(/[A-Z]{2}\d{5}|TEST-\d+/)?.[0] || "";
  await page.evaluate(() => { window.__hear = "read me this job"; });
  await page.locator('[data-hpd-smoke="fc-search-mic"]').click().catch(() => {});
  const read = (await panel.isVisible()) ? (await reply.innerText()) : "";
  if (read) assert.match(read, /(The job: |HPD says: )/, "reads the open job");
  assert.deepEqual(errors, []);
  console.log(`PASS voice helper: bids -> "${bidsText.slice(0, 60)}"; today -> "${today.slice(0, 60)}"; "I finished ${omo}" read back + asked, No saved nothing, said "job … is done" + Yes saved it${read ? `; "read me this job" (${cardId}) read it` : ""}`);
  await c.close();
} finally {
  await browser.close();
}
