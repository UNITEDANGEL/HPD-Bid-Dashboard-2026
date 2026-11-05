// The robot's new answers (owner, 4 Nov: "do all ideas and keep upgrading") at iPhone size on real jobs, the AI faked:
// 🧾 "am I missing paperwork", 🗺 "where am I losing time", 🎉 "good news", 📸 before and after side by side,
// 🧠 yesterday's talk goes to the AI, 🗣 a slow answer gets a short "let me check" first. 📤 The ER07663 ask: "See what
// you sent" gets every file of the email (PDF, photos, video) and "Get a copy of everything" hands them to the share
// sheet. Nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "ER06362";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", timezoneId: "America/New_York" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const asked = [];
  await c.route(/\/api\/drive\/hpd-ask/, async (r) => { const b = JSON.parse(r.request().postData() || "{}"); asked.push(b); await new Promise((ok) => setTimeout(ok, 2200)); return r.fulfill({ json: { ai: true, text: "Yes, it went out yesterday at 3 PM." } }); });
  const JPG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");
  await c.route("**/api/drive/hpd-sent", (r) => r.fulfill({ json: { omo: JOB, emails: [{ id: "m0000000001", threadId: "19a0b1c2d3e4f5a6", at: "2026-11-04T14:05:00Z", to: "owner@example.com", subject: `SIGNED - ${JOB} - Work Completed`, files: [
    { i: 0, name: `SIGNED - ${JOB} - Work Completed.pdf`, size: 1000, mime: "application/pdf" },
    { i: 1, name: `BEFORE-01 - ${JOB}.jpg`, size: JPG.length, mime: "image/jpeg" },
    { i: 2, name: `AFTER-01 - ${JOB}.jpg`, size: JPG.length, mime: "image/jpeg" },
    { i: 3, name: `AFTER VIDEO-01 - ${JOB}.mp4`, size: 20, mime: "video/mp4" }] }] } }));
  await c.route("**/api/drive/hpd-sent-pdf", (r) => { const { i } = JSON.parse(r.request().postData() || "{}"); return r.fulfill({ status: 200, body: i === 0 ? Buffer.from("%PDF-1.4\n%%EOF") : i === 3 ? Buffer.from("AAAAIGZ0eXBpc29t") : JPG, headers: { "Content-Type": i === 0 ? "application/pdf" : i === 3 ? "video/mp4" : "image/jpeg" } }); });
  await c.addInitScript(() => {
    window.__said = [];
    window.__shared = null;
    if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 20); };
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { title: d.title, files: (d.files || []).map((f) => `${f.name}|${f.type}`) }; };
    // Talked about yesterday (kept on the phone 3 days).
    if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("hpd-chat-memory", JSON.stringify([{ you: "did the ER07663 video go out", helper: "Not yet: it is still on the phone.", at: Date.now() - 86400000 }])); }
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const reply = page.locator('[data-hpd-smoke="fc-agent-reply"]');
  const say = async (text, re) => {
    if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
    if (await page.locator(".fc-job-sheet-close").count()) await page.locator(".fc-job-sheet-close").first().click().catch(() => {});
    await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill(text);
    await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
    await page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), re.source, { timeout: 20000 }).catch(async () => { throw new Error(`"${text}" got: ${await reply.innerText().catch(() => "no chat")}`); });
    return reply.innerText();
  };
  const paper = await say("am I missing paperwork", /^🧾 /);
  assert.equal(asked.length, 0, "worked out on the phone");
  const time = await say("where am I losing time", /^🗺 /);
  const good = await say("good news", /^🎉 /);
  // 💵 One job's payment, from HPD's payment list (or how long it's been waiting).
  const paid = await say(`did HPD pay me for ${JOB}`, new RegExp(`^💵 (Yes: HPD paid|Partly|Not yet|${JOB} isn't in HPD's payment list)`));
  // 🕒 On my way: the tenant text, read back for a yes (or the reason it can't).
  const omw = await say(`on my way to ${JOB}`, /I'm on my way|no tenant phone|Tap to open it in Messages/);
  assert.match(good, /^🎉 (Great day!|Busy day, well done!|Nice work!|Quiet day)/);

  // 📸 Before and after: the newest of each, side by side, shared together.
  await page.evaluate(async (job) => {
    let db = null;
    for (let i = 0; i < 60 && !db; i++) {
      const open = await new Promise((ok, no) => { const r = indexedDB.open("hpd-field-photos-v1"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      if (open.objectStoreNames.contains("photos")) db = open; else { open.close(); await new Promise((ok) => setTimeout(ok, 500)); }
    }
    const png = (color) => { const c = document.createElement("canvas"); c.width = 30; c.height = 40; const g = c.getContext("2d"); g.fillStyle = color; g.fillRect(0, 0, 30, 40); return c.toDataURL("image/jpeg"); };
    const row = (kind, at, color) => ({ id: `${job}-${kind}-${at}-abc123`, jobId: job, kind, mediaType: "image", evidenceLabel: kind, address: "", location: "", borough: "", outcome: "", name: `${kind}.jpg`, type: "image/jpeg", size: 10, dataUrl: png(color), capturedAt: at });
    await new Promise((ok, no) => { const tx = db.transaction("photos", "readwrite"); tx.objectStore("photos").put(row("before", "2026-11-04T13:00:00.000Z", "#a00")); tx.objectStore("photos").put(row("after", "2026-11-04T15:00:00.000Z", "#0a0")); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
  }, JOB);
  await say(`show me the before and after for ${JOB}`, new RegExp(`^📸 ${JOB} .*before and after`));
  const ba = page.locator('[data-hpd-smoke="fc-agent-ba"]');
  await ba.waitFor({ timeout: 10000 });
  assert.equal(await ba.locator("img").count(), 2);
  await ba.locator('[data-hpd-smoke="fc-agent-ba-share"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  assert.deepEqual((await page.evaluate(() => window.__shared)).files, [`${JOB} BEFORE.jpg|image/jpeg`, `${JOB} AFTER.jpg|image/jpeg`]);

  // 🧠 + 🗣 A question for the AI: yesterday's talk goes along; the slow answer gets "let me check" first.
  await page.evaluate(() => { window.__said = []; });
  await say("did the video for ER07663 go out yesterday?", /went out yesterday/);
  assert.deepEqual(asked[0].facts.earlierDays.map((t) => t.you), ["did the ER07663 video go out"]);
  assert.ok(/^(Let me check\.|One sec\.|Let me look\.|Hmm, let me see\.)$/.test((await page.evaluate(() => window.__said))[0] || ""), `a short "let me check" first: ${JSON.stringify(await page.evaluate(() => window.__said))}`);
  assert.match(asked[0].facts.ownerName, /\S/);

  // 📈 The month on one page: a real PDF, opened or shared from the chat.
  await page.evaluate(() => { window.__shared = null; });
  const month = await say("month report", /^📈 \w+ \d{4} so far: \d+ jobs? won/);
  await page.locator('[data-hpd-smoke="fc-agent-file"]').waitFor({ timeout: 10000 });
  const pdfHead = await page.evaluate(async () => { const a = document.querySelector('[data-hpd-smoke="fc-agent-file-open"]'); const b = new Uint8Array(await (await fetch(a.dataset.url)).arrayBuffer()); return String.fromCharCode(...b.slice(0, 5)) + "|" + b.length; });
  assert.match(pdfHead, /^%PDF-\|\d{4,}$/);
  // It opens right in the chat (a new tab is blocked in the iPhone Home Screen app).
  await page.locator('[data-hpd-smoke="fc-agent-file-open"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-file-view"] [data-hpd-smoke="fc-itb-thumb"]').first().waitFor({ timeout: 20000 });
  await page.locator('[data-hpd-smoke="fc-agent-file-share"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  assert.match((await page.evaluate(() => window.__shared)).files[0], /^HPD Field - \w+ \d{4} \(so far\)\.pdf\|application\/pdf$/);

  // 📷 Retake before you leave: a black photo is said out loud with one big Retake button that opens the camera again.
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const black = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 300; const g = c.getContext("2d"); g.fillStyle = "#020202"; g.fillRect(0, 0, 400, 300); return c.toDataURL("image/jpeg", 0.9).split(",")[1]; });
  const startBtn = page.locator("#fc-job-card button", { hasText: /Before\s*(Tap to add|\d)/ }).first();
  await startBtn.click();
  const take = page.locator("#fc-job-card button", { hasText: /Take (before )?photo/ }).first();
  await take.waitFor({ timeout: 10000 });
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), take.click()]);
  await page.evaluate(() => { window.__said = []; });
  await chooser.setFiles({ name: "dark.jpg", mimeType: "image/jpeg", buffer: Buffer.from(black, "base64") });
  const retake = page.locator('[data-hpd-smoke="jc-retake"]');
  await retake.waitFor({ timeout: 30000 });
  assert.match(await retake.innerText(), /That before photo looks too dark/);
  await page.waitForFunction(() => window.__said.some((t) => /photo looks too dark/.test(t)), null, { timeout: 5000 });
  const [again] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.locator('[data-hpd-smoke="jc-retake-go"]').click()]);
  assert.ok(again, "Retake opens the camera again");
  assert.equal(await retake.count(), 0);
  await page.locator(".fc-job-sheet-close").click().catch(() => {});

  // 📤 Everything that was sent, as a copy: from the job card's "See what you sent".
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.evaluate((job) => {
    const rows = JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}");
    const at = new Date(Date.now() - 3600000).toISOString();
    rows[job] = { ...(rows[job] || {}), FieldOutcome: "WORK_COMPLETED", fieldOutcome: "WORK_COMPLETED", PackageApprovedAt: at, PackageReviewStatus: "Approved", PackageEmailedAt: at, updatedAt: at };
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify(rows));
  }, JOB);
  await page.evaluate(() => { window.__shared = null; });
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const open = page.locator('#fc-job-card [data-hpd-smoke="fc-sent-open"]');
  await open.waitFor({ timeout: 20000 });
  await open.click();
  const box = page.locator('#fc-job-card [data-hpd-smoke="fc-sent"]');
  await box.locator('[data-hpd-smoke="fc-sent-email"]').waitFor({ timeout: 20000 });
  assert.equal(await box.locator('[data-hpd-smoke="fc-sent-file"]').count(), 4, "the PDF, both photos and the video");
  await box.locator('[data-hpd-smoke="fc-sent-file"]').nth(1).click();
  await box.locator('[data-hpd-smoke="fc-sent-pdf"] img').waitFor({ timeout: 10000 });
  await box.locator('[data-hpd-smoke="fc-sent-copy"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 15000 });
  assert.deepEqual((await page.evaluate(() => window.__shared)).files, [`SIGNED - ${JOB} - Work Completed.pdf|application/pdf`, `BEFORE-01 - ${JOB}.jpg|image/jpeg`, `AFTER-01 - ${JOB}.jpg|image/jpeg`, `AFTER VIDEO-01 - ${JOB}.mp4|video/mp4`]);
  await page.waitForFunction(() => /4 files ready: pick Mail to send them, or Save to Files/.test(document.querySelector('[data-hpd-smoke="fc-sent-copy-msg"]')?.textContent || ""), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  console.log(`PASS robot ideas: "${paid.slice(0, 60)}"; on my way -> "${omw.replace(/\s+/g, " ").slice(0, 60)}…"; the month report is a real PDF to open or share (${month.replace(/\s+/g, " ").slice(0, 60)}…); a dark photo -> said out loud + Retake opens the camera; "${paper.replace(/\s+/g, " ").slice(0, 70)}…"; "${time.replace(/\s+/g, " ").slice(0, 70)}…"; "${good.replace(/\s+/g, " ").slice(0, 60)}"; before and after side by side, shared together; yesterday's talk goes to the AI; a slow answer starts with "let me check"; See what you sent shows the PDF, photos and video, and Get a copy of everything shares all 4`);
} finally {
  await browser.close();
}
