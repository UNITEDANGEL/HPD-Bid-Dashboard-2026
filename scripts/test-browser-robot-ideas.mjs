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
  await c.route(/\/api\/drive\/hpd-ask/, async (r) => { const b = JSON.parse(r.request().postData() || "{}"); asked.push(b); await new Promise((ok) => setTimeout(ok, 2200)); return r.fulfill({ json: { ai: true, text: /shrug test/.test(b.question) ? "I'm not sure: nothing in the app says that." : "Yes, it went out yesterday at 3 PM." } }); });
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
  // 👄 The mouth follows the words: a voice that reports each word (like Safari's) moves the mouth shape by shape.
  await page.evaluate(() => { window.__visemes = new Set(); window.speechSynthesis.speak = (u) => { window.__said.push(u.text); const words = [...u.text.matchAll(/\S+/g)]; words.forEach((m, i) => setTimeout(() => u.onboundary?.({ name: "word", charIndex: m.index }), 300 + 250 * i)); setTimeout(() => u.onend?.(), 250 * words.length + 600); }; new MutationObserver(() => { const v = document.querySelector('[data-hpd-smoke="fc-agent-who"] [data-hpd-smoke="fc-face"]')?.getAttribute("data-viseme"); if (v) window.__visemes.add(v); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-viseme"] }); });
  const good = await say("good news", /^🎉 /);
  await page.waitForFunction(() => window.__visemes.size >= 2, null, { timeout: 15000 });
  const shapes = [...(await page.evaluate(() => [...window.__visemes]))].sort().join(", ");
  // 🏷 Its name (🎨): shown on the chat, and it answers to it; "Hey Mike" alone -> "Yes?".
  await page.locator('[data-hpd-smoke="fc-agent-dress"]').click();
  await page.locator('[data-hpd-smoke="fc-dress-name"]').fill("Mike");
  await page.locator('[data-hpd-smoke="fc-dress-name"]').blur();
  await page.waitForFunction(() => /"name":"Mike"/.test(localStorage.getItem("hpd-helper-look") || ""), null, { timeout: 3000 });
  const named = await say("hey Mike, good news", /^🎉 /);
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-who"]').innerText(), /Mike|Talking to you/);
  await say("Hey Mike", /^Yes\? I'm listening\.$/);
  // 💬 After a package goes out: "How did it go at …?", and the answer is kept as the job's note.
  if (await page.locator('[data-hpd-smoke="fc-agent-close"]').count()) await page.locator('[data-hpd-smoke="fc-agent-close"]').click();
  await page.evaluate((job) => window.postMessage({ type: "hpd-package-approved", job, emailed: true }, location.origin), JOB);
  await page.waitForFunction(() => /^How did it go at /.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 8000 });
  await say("the tenant was happy, gate code 4521", new RegExp(`^📝 Saved on ${JOB}'s card`));
  assert.match(await page.evaluate(() => localStorage.getItem("hpd-job-notes") || ""), /gate code 4521/);
  // 🚗 A whole day hands-free: driving mode on and the day read out.
  await say("hands free day", /Today:|Nothing on|Your day/);
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-drive"]').getAttribute("aria-pressed"), "true");
  await say("I'm parked", /./);
  // 🙌 Not sure -> it shrugs (both hands up).
  await page.evaluate(() => { window.__shrug = false; new MutationObserver(() => { if (document.querySelector('[data-hpd-smoke="fc-agent-who"] [data-hpd-smoke="fc-face"]')?.getAttribute("data-arms") === "shrug") window.__shrug = true; }).observe(document.body, { subtree: true, attributes: true, childList: true }); });
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
  assert.deepEqual(asked.find((x) => /video for ER07663/.test(x.question)).facts.earlierDays.map((t) => t.you), ["did the ER07663 video go out"]);
  assert.ok(/^(Let me check\.|One sec\.|Let me look\.|Hmm, let me see\.)$/.test((await page.evaluate(() => window.__said))[0] || ""), `a short "let me check" first: ${JSON.stringify(await page.evaluate(() => window.__said))}`);
  assert.match(asked.find((x) => /video for ER07663/.test(x.question)).facts.ownerName, /\S/);

  await say("why did the shrug test happen today?", /I'm not sure/);
  await page.waitForFunction(() => window.__shrug, null, { timeout: 8000 });
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
  console.log(`PASS robot ideas: "How did it go?" after a package -> the answer saved on the job card; "hands free day" -> driving mode on and the day read out; named "Mike", it answers to its name and says "Yes?" when called; it shrugs when not sure; the mouth follows the words (${shapes}); "${paid.slice(0, 60)}"; on my way -> "${omw.replace(/\s+/g, " ").slice(0, 60)}…"; the month report is a real PDF to open or share (${month.replace(/\s+/g, " ").slice(0, 60)}…); a dark photo -> said out loud + Retake opens the camera; "${paper.replace(/\s+/g, " ").slice(0, 70)}…"; "${time.replace(/\s+/g, " ").slice(0, 70)}…"; "${good.replace(/\s+/g, " ").slice(0, 60)}"; before and after side by side, shared together; yesterday's talk goes to the AI; a slow answer starts with "let me check"; See what you sent shows the PDF, photos and video, and Get a copy of everything shares all 4`);
} finally {
  await browser.close();
}
