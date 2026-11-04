// The package waits for you (owner, 4 Nov, ER07663: "you automatically sent the email without verifying I was finished
// with the before and after pictures. Now one of the after videos is missing"). At iPhone size:
// 1) A photo/video taken AFTER the package went out shows on the job card ("📎 1 video taken after it was sent"), and
//    one tap on the package page sends just that video into the same Drive package folder and to the owner's email.
// Google is faked here; nothing is sent.
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
  const uploads = [];
  const emails = [];
  await c.route("**/api/drive/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/session")) return route.fulfill({ json: { configured: true, connected: true, canEmail: true, email: "owner@example.com" } });
    if (url.includes("/package-folder")) return route.fulfill({ json: { folderId: "NEWFOLDER123", link: "https://drive.google.com/drive/folders/NEWFOLDER123" } });
    if (url.includes("/package-file")) { const h = route.request().headers(); uploads.push({ name: decodeURIComponent(h["x-hpd-name"] || ""), folder: h["x-hpd-folder"], sub: decodeURIComponent(h["x-hpd-subfolder"] || "") }); return route.fulfill({ json: { id: "FILE1234567890" } }); }
    if (url.includes("/email-package")) { emails.push({ subject: decodeURIComponent(route.request().headers()["x-hpd-subject"] || ""), body: route.request().postData() || "" }); return route.fulfill({ json: { to: ["owner@example.com"] } }); }
    return route.fulfill({ json: {} });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Sent an hour ago, filed in Drive.
  const sentAt = new Date(Date.now() - 3600000).toISOString();
  await page.goto(`${baseUrl}/paperwork?job=${JOB}`, { waitUntil: "load", timeout: 180000 });
  await page.evaluate(({ job, sentAt }) => {
    const rows = JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}");
    rows[job] = { ...(rows[job] || {}), FieldOutcome: "WORK_COMPLETED", fieldOutcome: "WORK_COMPLETED", PackageApprovedAt: sentAt, PackageReviewStatus: "Approved", PackageEmailedAt: sentAt, PackageEmailedTo: "owner@example.com", PackageDriveLink: "https://drive.google.com/drive/folders/SENTFOLDER12345", updatedAt: sentAt };
    localStorage.setItem("hpd-job-workflow-overrides-v2", JSON.stringify(rows));
  }, { job: JOB, sentAt });
  // One after video saved on the phone 10 minutes ago (after the package went out), one after photo from before it.
  await page.evaluate(async ({ job, sentAt }) => {
    // The page makes its photo store as it loads: wait for it.
    let db = null;
    for (let i = 0; i < 60 && !db; i++) {
      const open = await new Promise((ok, no) => { const r = indexedDB.open("hpd-field-photos-v1"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      if (open.objectStoreNames.contains("photos")) db = open; else { open.close(); await new Promise((ok) => setTimeout(ok, 500)); }
    }
    if (!db) throw new Error("the photo store never appeared");
    const late = new Date(Date.now() - 600000).toISOString();
    const early = new Date(Date.parse(sentAt) - 600000).toISOString();
    const row = (kind, type, at, mediaType, dataUrl) => ({ id: `${job}-${kind}-${at}-abc123`, jobId: job, kind, mediaType, evidenceLabel: "After Work Evidence", address: "", location: "", borough: "", outcome: "", name: `${job}-after.${mediaType === "video" ? "mp4" : "jpg"}`, type, size: 10, dataUrl, capturedAt: at });
    await new Promise((ok, no) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").put(row("after", "video/mp4", late, "video", "data:video/mp4;base64,AAAAIGZ0eXBpc29t"));
      tx.objectStore("photos").put(row("after", "image/jpeg", early, "image", "data:image/jpeg;base64,/9j/4AAQSkZJRg=="));
      tx.oncomplete = ok; tx.onerror = () => no(tx.error);
    });
  }, { job: JOB, sentAt });

  // The job card says what wasn't sent.
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const late = page.locator('[data-hpd-smoke="jc-late-media"]');
  await late.waitFor({ timeout: 30000 });
  assert.match(await late.innerText(), /1 video taken after it was sent: send it/);
  await late.click();
  const sheet = page.frameLocator('[data-hpd-smoke="fc-package-sheet"] iframe');
  const box = sheet.locator('[data-hpd-smoke="paperwork-late-media"]');
  await box.waitFor({ timeout: 60000 });
  assert.match(await box.innerText(), /Taken after the package was sent: 1 after video/);
  await sheet.locator('[data-hpd-smoke="paperwork-late-send"]').click();
  await sheet.locator('[data-hpd-smoke="paperwork-late-result"]').waitFor({ timeout: 30000 });
  assert.match(await sheet.locator('[data-hpd-smoke="paperwork-late-result"]').innerText(), /✓ Sent 1 after video to owner@example\.com/);
  assert.deepEqual(uploads, [{ name: `AFTER VIDEO-ADDED-01 - ${JOB}.mp4`, folder: "SENTFOLDER12345", sub: "After videos" }], "only the late video, into the SAME package folder");
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, new RegExp(`^ADDED - ${JOB} - 1 after video - `));
  assert.ok(emails[0].body.includes(`AFTER VIDEO-ADDED-01 - ${JOB}.mp4`) && !emails[0].body.includes(".jpg"), "the email carries the video only");
  // Sent: it isn't offered again.
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-package-sheet"] iframe')?.contentDocument?.querySelector('[data-hpd-smoke="paperwork-late-send"]'), null, { timeout: 10000 });
  assert.deepEqual(errors, []);
  console.log(`PASS package send: a video taken after ${JOB} was sent shows on the job card; one tap sends only it into the same Drive package folder (After videos) and emails it ("ADDED - ${JOB} - 1 after video"); not offered again`);
} finally {
  await browser.close();
}
