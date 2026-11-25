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
  await page.locator('[data-hpd-smoke="worker-photo-file-before"]').setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") }, { name: "b.jpg", mimeType: "image/jpeg", buffer: Buffer.from("y") }]);
  await page.locator('[data-hpd-smoke="worker-video-file-before"]').setInputFiles({ name: "v.mp4", mimeType: "video/mp4", buffer: Buffer.from("video") });
  await page.locator('[data-hpd-smoke="worker-photo-file-after"]').setInputFiles({ name: "c.jpg", mimeType: "image/jpeg", buffer: Buffer.from("z") });
  await page.waitForFunction(() => document.querySelectorAll('[data-hpd-smoke="worker-item"]').length === 4, null, { timeout: 5000 });
  assert.equal(await page.locator('[data-hpd-smoke="worker-item"][data-side="before"]').count(), 3);
  assert.deepEqual(await page.locator('[data-hpd-smoke="worker-item"] b').allInnerTexts(), ["BEFORE", "BEFORE", "BEFORE 🎥", "AFTER"]);
  assert.match(await page.locator('[data-hpd-smoke="worker-count-before"]').innerText(), /3 taken/);
  assert.match(await page.locator('[data-hpd-smoke="worker-photos-go"]').innerText(), /go on job EQ15239's card/);
  await page.locator('[data-hpd-smoke="worker-send-photos"]').click();
  await page.waitForFunction(() => window.__shared && window.__shared.files, null, { timeout: 5000 });
  assert.deepEqual(await page.evaluate(() => window.__shared.files.map((f) => f.name)), ["EQ15239 BEFORE photo 1.jpg", "EQ15239 BEFORE photo 2.jpg", "EQ15239 BEFORE video 3.mp4", "EQ15239 AFTER photo 4.jpg"]);
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
  await c.route(/\/api\/drive\/worker-(start|piece)/, async (r) => {
    const h = r.request().headers();
    if (r.request().url().endsWith("worker-start")) { const b = JSON.parse(r.request().postData()); ups.push({ job: h["x-hpd-job"], pass: h["x-hpd-pass"], side: b.side, type: b.mimeType, n: b.n }); return r.fulfill({ json: { session: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc" } }); }
    return r.fulfill({ json: { done: true, id: "f1" } });
  });
  await page.goto(`${baseUrl}/worker/#o=EQ15239&k=1a2.ABCDEFGHIJKLMNOPQRSTUV`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-job"]').waitFor({ timeout: 30000 });
  await page.locator('[data-hpd-smoke="worker-photo-file-before"]').setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") });
  await page.locator('[data-hpd-smoke="worker-video-file-after"]').setInputFiles({ name: "v.mov", mimeType: "video/quicktime", buffer: Buffer.from("video") });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-hpd-smoke="worker-item"]')].filter((e) => e.dataset.state === "sent").length === 2, null, { timeout: 10000 });
  assert.deepEqual(ups, [{ job: "EQ15239", pass: "1a2.ABCDEFGHIJKLMNOPQRSTUV", side: "before", type: "image/jpeg", n: 1 }, { job: "EQ15239", pass: "1a2.ABCDEFGHIJKLMNOPQRSTUV", side: "after", type: "video/quicktime", n: 1 }]);
  assert.match(await page.locator('[data-hpd-smoke="worker-sent-line"]').innerText(), /All 2 are on job EQ15239's card/);
  assert.equal(await page.locator('[data-hpd-smoke="worker-send-photos"]').count(), 0, "no WhatsApp step with a pass");
  assert.deepEqual(errors, []);
  console.log("PASS worker view: job, navigate, call, BEFORE / AFTER photos and videos (labeled; straight to the job card with the pass, WhatsApp without), done; nothing about bids or money; job stays in the link");
} finally { await browser.close(); }
