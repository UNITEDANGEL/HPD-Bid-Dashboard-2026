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
  await page.locator('[data-hpd-smoke="worker-photo"]').first().check();
  await page.locator('[data-hpd-smoke="worker-photo-file"]').nth(1).setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") });
  // 24 Nov (owner: "worker should be able to take pics and update the job card"): a big 📷 Take button per spot opens
  // the camera; the page says the photos go on the job card.
  assert.equal(await page.locator('[data-hpd-smoke="worker-photo-take"]').count(), await page.locator('[data-hpd-smoke="worker-photo"]').count());
  assert.equal(await page.locator('[data-hpd-smoke="worker-photo-file"]').first().getAttribute("capture"), "environment");
  { const r = await page.locator('[data-hpd-smoke="worker-photo-take"]').first().boundingBox(); assert.ok(r && r.height >= 44 && r.x + r.width <= 390, "big enough and fits the phone"); }
  assert.match(await page.locator('[data-hpd-smoke="worker-photos-go"]').innerText(), /go on job EQ15239's card/);
  await page.locator('[data-hpd-smoke="worker-send-photos"]').click();
  await page.waitForFunction(() => window.__shared && window.__shared.files, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__shared.files.length), 1);
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('[data-hpd-smoke="worker-done"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  assert.match(await page.evaluate(() => window.__shared.text), /EQ15239 is done\. Photos taken: 2 of 2/);
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-done"]').waitFor();
  assert.match(await page.locator('[data-hpd-smoke="worker-done"]').innerText(), /Done/);
  assert.ok(await page.locator('[data-hpd-smoke="worker-photo"]').first().isChecked(), "photo tick kept on the phone");
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
  assert.equal(await page.locator('[data-hpd-smoke="worker-photo"]').count(), 2, "Before and After spots");
  await page.goto(`${baseUrl}/worker/#j=${b64(JSON.stringify(job)).slice(0, 60)}`, { waitUntil: "load" });
  await page.reload({ waitUntil: "load" });
  await page.locator('[data-hpd-smoke="worker-cut"]').waitFor({ timeout: 30000 });
  assert.ok(!requests.some((u) => u.includes("EQ15239") || u.includes("Jose")), "job never sent to a server");
  assert.deepEqual(errors, []);
  console.log("PASS worker view: job, navigate, call, photo ticks, done; nothing about bids or money; job stays in the link");
} finally { await browser.close(); }
