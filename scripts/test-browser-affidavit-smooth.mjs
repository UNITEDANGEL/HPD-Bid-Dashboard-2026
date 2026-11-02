// The affidavit the way the owner does it (2 Nov: "make sure you test the affidavits: a very smooth transaction"), at
// iPhone size on a phone that has never signed here (the Home Screen app), with the signatures already in the owner's
// Drive: the job card -> "Just the affidavit" -> Work completed -> Save -> the package button -> and then no
// other tap: both signatures go on by themselves, the package builds, the signed copy is emailed (to the owner only)
// and the signed + print copies are filed in Drive. Google is faked here; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "ER06362"; // awarded 10/13/26: today is a believable work date
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
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
    if (url.includes("/signatures")) return route.fulfill({ json: { signer: PNG, notary: PNG, notaryName: "CHETANPREET MALHI" } });
    if (url.includes("/package-folder")) return route.fulfill({ json: { folderId: "F1", link: "https://drive.example/F1" } });
    if (url.includes("/package-file")) { uploads.push(decodeURIComponent(route.request().headers()["x-hpd-name"] || "")); return route.fulfill({ json: { ok: true } }); }
    if (url.includes("/email-package")) { emails.push(decodeURIComponent(route.request().headers()["x-hpd-subject"] || "")); return route.fulfill({ json: { to: ["owner@example.com"] } }); }
    return route.fulfill({ json: {} });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  let taps = 0;
  const tap = async (sel) => { await page.locator(sel).first().click(); taps++; };
  // Open the job card (the map link the app uses for a job, like tapping its pin).
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  taps++;
  const box = page.locator('[data-hpd-smoke="jc-affidavit-only"]');
  await box.waitFor({ timeout: 20000 });
  await tap('[data-hpd-smoke="jc-affidavit-work_completed"]');
  await tap('[data-hpd-smoke="jc-affidavit-only"] [data-hpd-smoke="jc-step-save-outcome"]');
  await page.waitForFunction((j) => (JSON.parse(localStorage.getItem("hpd-job-workflow-overrides-v2") || "{}")[j] || {}).FieldOutcome === "WORK_COMPLETED", JOB, { timeout: 10000 });
  // Saved: the package opens by itself and goes out with no other tap (signatures from Drive, notary's on by itself).
  for (let i = 0; i < 240 && !(emails.length && uploads.some((u) => u.startsWith("NOT SIGNED"))); i++) await page.waitForTimeout(500);
  if (!emails.length && shots) await page.screenshot({ path: `${shots}/affidavit-smooth-stuck.png` });
  assert.equal(emails.length, 1, `the signed package emailed once by itself after Save (got ${emails.length})`);
  assert.equal(taps, 3, "the job, Work completed, Save: nothing else");
  assert.match(emails[0], new RegExp(`^SIGNED - ${JOB} - Work Completed`));
  assert.ok(uploads.includes(`SIGNED - ${JOB} - Work Completed.pdf`), `signed copy in Drive (${uploads.join(", ")})`);
  assert.ok(uploads.includes(`NOT SIGNED - print copy - ${JOB} - Work Completed.pdf`), "print copy in Drive");
  // The sheet closes by itself with "approved and emailed".
  await page.waitForFunction(() => !document.querySelector('[data-hpd-smoke="fc-package-sheet"]'), null, { timeout: 30000 });
  await page.waitForFunction((j) => new RegExp(`${j} package approved and emailed`).test(document.body.innerText), JOB, { timeout: 10000 });
  if (shots) await page.screenshot({ path: `${shots}/affidavit-smooth.png` });
  // The package button is gone once it's approved. Opened again another way (close-out list, a link, the voice
  // helper): it shows as sent and locked (Revise to change it), nothing sent twice.
  assert.equal(await page.locator('[data-hpd-smoke="jc-step-package"]').count(), 0, "no package button after it's emailed");
  await page.goto(`${baseUrl}/paperwork?job=${JOB}&media=all&auto=package&outcome=work_completed`, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => /Paperwork sent to HPD on[\s\S]*Locked: this is the version HPD has/.test(document.body.innerText), null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  assert.equal(emails.length, 1, "opened again: locked, not emailed a second time");
  console.log(`PASS affidavit, smooth: ${JOB} from the job card in 3 taps (job, Work completed, Save) -> package opens and goes out by itself (signatures from Drive) -> signed copy emailed once, signed + print copies in Drive, sheet closes; opened again: locked as sent, nothing sent twice`);
} finally {
  await browser.close();
}
