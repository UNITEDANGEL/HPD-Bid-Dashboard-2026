// 👷 Worker view: the link made by "Send to a worker" opens a lite job page (address, work, navigate, call, photo ticks, done);
// the job rides in the # part (never sent to a server); no bid / money words.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
const job = { id: "EQ15239", address: "1207 1 AVENUE, NEW YORK, 10065", apt: "4B", by: "11/20/2026", work: ["Replace kitchen faucet", "Patch ceiling 2 x 2 ft"], photos: ["Before photos", "After photos"], contact: { name: "Super Jose", phone: "(212) 555-0147", note: "basement door" }, tenant: { name: "Tenant A", phone: "(718) 555-0100" }, where: "Inside the apartment (apt 4B): kitchen", full: "REPLACE THE KITCHEN FAUCET.\nPATCH THE CEILING." };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.addInitScript(() => { navigator.share = (d) => { window.__shared = d; return Promise.resolve(); }; });
  const page = await c.newPage();
  const errors = []; const requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(`${baseUrl}/worker/`, { waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-empty"]').waitFor({ timeout: 30000 });
  await page.goto(`${baseUrl}/worker/#j=${b64(JSON.stringify(job))}`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-job"]').waitFor({ timeout: 30000 });
  assert.match(await page.locator('[data-hpd-smoke="worker-id"]').innerText(), /EQ15239/);
  assert.match(await page.locator('[data-hpd-smoke="worker-address"]').innerText(), /1207 1 AVENUE, NEW YORK, apt 4B/);
  assert.match(await page.locator('[data-hpd-smoke="worker-nav"]').getAttribute("href"), /google\.com\/maps/);
  assert.equal(await page.locator('[data-hpd-smoke="worker-call-super"]').getAttribute("href"), "tel:2125550147");
  assert.equal(await page.locator('[data-hpd-smoke="worker-work"] li').count(), 2);
  assert.match(await page.locator('[data-hpd-smoke="worker-where"]').innerText(), /Where: Inside the apartment \(apt 4B\): kitchen/);
  assert.match(await page.locator('[data-hpd-smoke="worker-full"]').innerText(), /REPLACE THE KITCHEN FAUCET\.\nPATCH THE CEILING\./);
  assert.equal(await page.locator('[data-hpd-smoke="worker-call-tenant"]').getAttribute("href"), "tel:7185550100");
  // 25 Nov (owner: "labels for the before and after pictures ... a video button ... multiple before photos, multiple before
  // videos, same as after"): a BEFORE part and an AFTER part, each with 📷 Photo, 🎥 Video and 🖼 From phone; every one is
  // labeled. This link has no upload pass (an older link): they wait for the WhatsApp button.
  for (const side of ["before", "after"]) {
    const sec = page.locator(`[data-hpd-smoke="worker-side-${side}"]`);
    assert.match(await sec.innerText(), side === "before" ? /BEFORE the work/ : /AFTER the work/);
    assert.equal(await page.locator(`[data-hpd-smoke="worker-photo-file-${side}"]`).getAttribute("capture"), "environment");
    assert.equal(await page.locator(`[data-hpd-smoke="worker-video-file-${side}"]`).getAttribute("accept"), "video/*");
    for (const k of ["photo", "video"]) { const r = await page.locator(`[data-hpd-smoke="worker-${k}-${side}"]`).boundingBox(); assert.ok(r && r.height >= 44 && r.x + r.width <= 390, `${side} ${k}: big enough and fits the phone`); }
  }
  // 📍 Spot first (owner, 25 Nov: "label the location where the picture is taken"): tapping Photo before a spot asks for it.
  assert.match(await page.locator('[data-hpd-smoke="worker-spot-now"]').innerText(), /First tap where you are/);
  assert.deepEqual(await page.locator('[data-hpd-smoke="worker-spot"][data-from-hpd="1"]').evaluateAll((els) => els.map((e) => [e.dataset.spot, e.textContent])), [["Kitchen faucet", "📄 Kitchen faucet"], ["Kitchen", "📄 Kitchen"]], "the spots HPD's description names come first (26 Nov)");
  assert.equal(await page.locator('[data-hpd-smoke="worker-spot"]').first().getAttribute("data-spot"), "Kitchen faucet");
  await page.locator('[data-hpd-smoke="worker-photo-before"]').click();
  assert.match(await page.locator('[data-hpd-smoke="worker-msg"]').innerText(), /First tap where you are/);
  await page.locator('[data-hpd-smoke="worker-spot"][data-spot="Kitchen"]').click();
  assert.match(await page.locator('[data-hpd-smoke="worker-spot-now"]').innerText(), /Taking photos in: Kitchen/);
  await page.locator('[data-hpd-smoke="worker-photo-file-before"]').setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") }, { name: "b.jpg", mimeType: "image/jpeg", buffer: Buffer.from("y") }]);
  await page.locator('[data-hpd-smoke="worker-video-file-before"]').setInputFiles({ name: "v.mp4", mimeType: "video/mp4", buffer: Buffer.from("video") });
  await page.locator('[data-hpd-smoke="worker-photo-file-after"]').setInputFiles({ name: "c.jpg", mimeType: "image/jpeg", buffer: Buffer.from("z") });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="worker-item"]').length === 4, null, { timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="worker-item"][data-side="before"]').count(), 3);
  assert.deepEqual(await page.locator('[data-hpd-smoke="worker-item"] b').allInnerTexts(), ["BEFORE · Kitchen", "BEFORE · Kitchen", "BEFORE 🎥 · Kitchen", "AFTER · Kitchen"]);
  assert.match(await page.locator('[data-hpd-smoke="worker-count-before"]').innerText(), /3 taken/);
  // 25 Nov (owner: "I don't need them to send me back on WhatsApp"): no WhatsApp button; an old link (no upload pass) says
  // to ask for the job again.
  assert.equal(await page.locator('[data-hpd-smoke="worker-send-photos"]').count(), 0, "no WhatsApp step");
  assert.match(await page.locator('[data-hpd-smoke="worker-old-link"]').innerText(), /old link.+Ask your boss to send you the job again/);
  // 🏷 25 Nov (owner: "label for the work order number, address, location, bathroom or public hallway"): what's printed on each photo.
  assert.match(await page.locator('[data-hpd-smoke="worker-label-before"]').innerText(), /BEFORE · OMO EQ15239 · KITCHEN · Inside the apartment \(apt 4B\): kitchen · .+, apt 4B · date taken/);
  assert.match(await page.locator('[data-hpd-smoke="worker-label-after"]').innerText(), /AFTER · OMO EQ15239/);
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('[data-hpd-smoke="worker-done"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  assert.match(await page.evaluate(() => window.__shared.text), /EQ15239 is done\. Before: 3, after: 1\./);
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-done"]').waitFor();
  assert.match(await page.locator('[data-hpd-smoke="worker-done"]').innerText(), /Done/);
  const body = await page.locator("body").innerText();
  assert.ok(!/\b(bid|price|invoice|\$\d)/i.test(body), "no money words");
  assert.ok(!requests.some((u) => u.includes("EQ15239") || u.includes("Jose")), "job never sent to a server");
  // 20 Nov (owner's screenshot from WhatsApp: an empty Worker page): a short link without HPD's description still shows
  // it (read from the public job list by the job number), and a link cut on the way says so.
  await page.goto(`${baseUrl}/worker/#o=EQ15239&t=Ana&p=7185550100`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-job"]').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => /DRAINAGE/i.test(document.querySelector('[data-hpd-smoke="worker-full"]')?.textContent || ""), null, { timeout: 30000 });
  assert.match(await page.locator('[data-hpd-smoke="worker-address"]').innerText(), /📍 \S.*\d/);
  assert.ok((await page.locator('[data-hpd-smoke="worker-work"] li').count()) >= 1, "the work lines from HPD's description");
  assert.equal(await page.locator('[data-hpd-smoke="worker-call-tenant"]').getAttribute("href"), "tel:7185550100");
  assert.match(await page.locator('[data-hpd-smoke="worker-call-tenant"]').innerText(), /Ana/);
  assert.equal(await page.locator('[data-hpd-smoke^="worker-side-"]').count(), 2, "Before and After parts");
  await page.goto(`${baseUrl}/worker/#j=${b64(JSON.stringify(job)).slice(0, 60)}`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-cut"]').waitFor({ timeout: 30000 });
  assert.ok(!requests.some((u) => u.includes("EQ15239") || u.includes("Jose")), "job never sent to a server");
  // With the upload pass (k=…, 25 Nov): each one goes straight to the job card as soon as it's taken, in pieces, labeled.
  const ups = [];
  // 💬 26 Nov: the chat with the boss on the job page (same pass).
  const chatLog = [{ at: "2026-11-26T14:00:00.000Z", from: "boss", text: "Call me when you get there" }];
  await c.route(/\/api\/drive\/worker-chat$/, async (r) => {
    const h = r.request().headers();
    if (h["x-hpd-pass"] !== "1a2.ABCDEFGHIJKLMNOPQRSTUV") return r.fulfill({ status: 403, json: { error: "no pass" } });
    const b = JSON.parse(r.request().postData() || "{}");
    if (b.text) chatLog.push({ at: new Date().toISOString(), from: "worker", text: b.text });
    return r.fulfill({ json: { messages: chatLog } });
  });
  await c.route(/\/api\/drive\/worker-(start|piece)/, async (r) => {
    const h = r.request().headers();
    if (r.request().url().endsWith("worker-start")) { const b = JSON.parse(r.request().postData()); ups.push({ job: h["x-hpd-job"], pass: h["x-hpd-pass"], side: b.side, type: b.mimeType, n: b.n, where: b.where }); return r.fulfill({ json: { session: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc" } }); }
    return r.fulfill({ json: { done: true, id: "f1" } });
  });
  await page.goto(`${baseUrl}/worker/#o=EQ15239&k=1a2.ABCDEFGHIJKLMNOPQRSTUV`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-job"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="worker-spot-other"]').click();
  await page.locator('[data-hpd-smoke="worker-spot-type"]').fill("back bedroom closet");
  await page.locator('[data-hpd-smoke="worker-spot-type"]').press("Enter");
  await page.locator('[data-hpd-smoke="worker-photo-file-before"]').setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") });
  await page.locator('[data-hpd-smoke="worker-video-file-after"]').setInputFiles({ name: "v.mov", mimeType: "video/quicktime", buffer: Buffer.from("video") });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="worker-item"]')].filter((e) => e.dataset.state === "sent").length === 2, null, { timeout: 10000 });
  assert.deepEqual(ups, [{ job: "EQ15239", pass: "1a2.ABCDEFGHIJKLMNOPQRSTUV", side: "before", type: "image/jpeg", n: 1, where: "Back bedroom closet" }, { job: "EQ15239", pass: "1a2.ABCDEFGHIJKLMNOPQRSTUV", side: "after", type: "video/quicktime", n: 1, where: "Back bedroom closet" }]);
  assert.match(await page.locator('[data-hpd-smoke="worker-sent-line"]').innerText(), /All 2 are on job EQ15239's card/);
  assert.equal(await page.locator('[data-hpd-smoke="worker-send-photos"]').count(), 0, "no WhatsApp step with a pass");
  // A real photo is labeled on the worker's phone (OMO / location / address / date printed on it) and sent as "labeled".
  const jpg = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 800; c.height = 600; const x = c.getContext("2d"); for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i % 40)}%)`; x.fillRect((i * 53) % 800, (i * 29) % 600, 60, 40); } return c.toDataURL("image/jpeg", 0.9).split(",")[1]; }), "base64");
  const bodies = [];
  page.on("request", (r) => { if (r.url().endsWith("worker-start")) bodies.push(JSON.parse(r.postData())); });
  await page.locator('[data-hpd-smoke="worker-photo-file-after"]').setInputFiles({ name: "IMG_1.jpg", mimeType: "image/jpeg", buffer: jpg });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="worker-item"]')].filter((e) => e.dataset.state === "sent").length === 3, null, { timeout: 15000 });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].labeled, true, "photo labeled on the worker's phone");
  await page.locator('[data-hpd-smoke="worker-chat-msg"][data-from="boss"]').waitFor({ timeout: 10000 });
  assert.match(await page.locator('[data-hpd-smoke="worker-chat-msg"]').first().innerText(), /Boss · .*Call me when you get there/s);
  await page.locator('[data-hpd-smoke="worker-chat-input"]').fill("I'm here, door is open");
  await page.locator('[data-hpd-smoke="worker-chat-send"]').click();
  await page.locator('[data-hpd-smoke="worker-chat-msg"][data-from="worker"]').waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-hpd-smoke="worker-chat-input"]').inputValue(), "", "box empties after sending");
  assert.match(chatLog.slice(-1)[0].text, /I'm here, door is open/);
  // ✅ Job done goes into the chat (no WhatsApp). (Marked done earlier in this test: undo first.)
  if (/tap to undo/.test(await page.locator('[data-hpd-smoke="worker-done"]').innerText())) await page.locator('[data-hpd-smoke="worker-done"]').click();
  await page.locator('[data-hpd-smoke="worker-done"]').click();
  await page.waitForFunction(() => /Your boss sees it in the chat/.test(document.querySelector('[data-hpd-smoke="worker-msg"]')?.textContent || ""), null, { timeout: 10000 });
  assert.match(chatLog.slice(-1)[0].text, /HPD job EQ15239 is done/);
  assert.deepEqual(errors, []);
  console.log("PASS worker view: job, navigate, call, BEFORE / AFTER photos and videos (labeled; straight to the job card with the pass, WhatsApp without), done; nothing about bids or money; job stays in the link");
} finally { await browser.close(); }
