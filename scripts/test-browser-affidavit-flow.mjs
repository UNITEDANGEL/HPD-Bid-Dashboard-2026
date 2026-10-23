// Affidavit flow (owner, 23 Oct: "it keeps asking me to sign... that should be automatic... always check if we
// need the old affidavit or the new version"), at iPhone size with real jobs:
// 1. ER03009 (awarded 08/14/26, before Aug 28) shows "Earlier HPD affidavit" and is built on the 2025 form.
//    Signing once there saves your signature and the notary's to Drive (faked here; nothing leaves this test).
// 2. A fresh copy of the app (like the Home Screen app next to Chrome) opens ER05729 (awarded 09/17/26):
//    "New HPD affidavit", your signature is already on with no signing step, the notary's is one tap, and
//    the package builds on the new form right after that tap.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const drive = { signer: "", notary: "", notaryName: "" };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

// On a timeout, say what the page said.
async function built(page) {
  try { await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 90000 }); }
  catch (e) {
    const said = await page.evaluate(() => [...document.querySelectorAll('[aria-live], [role=alert]')].map((n) => n.textContent.trim()).filter(Boolean).join(" | "));
    throw new Error(`package not built. Page says: ${said}`);
  }
}

async function phone() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  // The owner's private Drive file of saved signatures.
  await c.route(/\/api\/drive\/signatures/, (r) => {
    const body = r.request().postDataJSON();
    if (body.op === "save") for (const key of Object.keys(drive)) if (key in body) drive[key] = body[key];
    return r.fulfill({ json: body.op === "save" ? { saved: true } : drive });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const templates = [];
  page.on("request", (q) => { if (/\/templates\/.*affidavit/.test(q.url())) templates.push(new URL(q.url()).pathname); });
  return { c, page, errors, templates };
}

try {
  // 1. Old job, first copy of the app: sign once.
  {
    const { c, page, errors, templates } = await phone();
    await page.goto(`${baseUrl}/paperwork?job=ER03009&outcome=work_completed`, { waitUntil: "networkidle" });
    const version = page.locator('[data-hpd-smoke="paperwork-affidavit-version"]');
    await version.waitFor({ timeout: 30000 });
    assert.equal(await version.getAttribute("data-legacy"), "1", "awarded 08/14/26 -> earlier affidavit");
    assert.match(await version.innerText(), /Earlier HPD affidavit/);
    await page.locator('[data-hpd-smoke="paperwork-signature-quick"]').click();
    await page.locator('[data-hpd-smoke="paperwork-signature-preview"]').waitFor({ timeout: 10000 });
    await page.locator('[data-hpd-smoke="paperwork-notary-quick"]').click();
    await page.locator('[data-hpd-smoke="paperwork-notary-preview"]').waitFor({ timeout: 10000 });
    for (let i = 0; i < 50 && !(drive.signer && drive.notary); i++) await page.waitForTimeout(100);
    assert.ok(drive.signer.startsWith("data:image/png") && drive.notary.startsWith("data:image/png"), "both signatures copied to Drive");
    assert.ok(drive.notaryName, "notary name copied to Drive");
    if (shots) await page.screenshot({ path: `${shots}/affidavit-old-job.png` });
    // HPD's own work dates for this August job (the app asks before using a date months after the award).
    const useHpdDates = page.locator('[data-hpd-smoke="paperwork-old-dates-use"]');
    if (await useHpdDates.count()) await useHpdDates.click();
    await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();
    await built(page);
    assert.ok(templates.some((t) => /-2025\.pdf$/.test(t)), `old job built on the 2025 form (got ${templates.join(", ")})`);
    assert.ok(!templates.some((t) => /affidavit\.pdf$/.test(t)), "old job never loads the new form");
    assert.deepEqual(errors, []);
    await c.close();
  }
  // 2. New job, a different copy of the app with nothing saved on it.
  {
    const { c, page, errors, templates } = await phone();
    await page.goto(`${baseUrl}/paperwork?job=ER05729&outcome=work_completed`, { waitUntil: "networkidle" });
    const version = page.locator('[data-hpd-smoke="paperwork-affidavit-version"]');
    await version.waitFor({ timeout: 30000 });
    assert.equal(await version.getAttribute("data-legacy"), "0", "awarded 09/17/26 -> new affidavit");
    assert.match(await version.innerText(), /New HPD affidavit/);
    // Your signature came from Drive: nothing to sign.
    await page.locator('[data-hpd-smoke="paperwork-signature-preview"]').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('[data-hpd-smoke="paperwork-signature-quick"]').count(), 0, "no 'sign' button when the signature is saved");
    assert.equal(await page.locator('[data-hpd-smoke="paperwork-signature-draw"]').count(), 0, "signing tools are folded away");
    assert.match(await page.locator('[data-hpd-smoke="paperwork-signature-card"]').innerText(), /goes on by itself/);
    // The notary: one tap, name and date on the button.
    const approve = page.locator('[data-hpd-smoke="paperwork-notary-approve"]');
    await approve.waitFor({ timeout: 15000 });
    assert.match(await approve.innerText(), /witnessed the signing/i);
    assert.equal(await page.locator('[data-hpd-smoke="paperwork-notary-name"]').count(), 0, "notary name already filled, not asked");
    await approve.scrollIntoViewIfNeeded();
    if (shots) await page.screenshot({ path: `${shots}/affidavit-new-job-one-tap.png` });
    await approve.click();
    await built(page);
    assert.ok(templates.some((t) => /\/(work|no-work)-performed-affidavit\.pdf$/.test(t)), `new job built on the new form (got ${templates.join(", ")})`);
    assert.ok(!templates.some((t) => /-2025\.pdf$/.test(t)), "new job never loads the 2025 form");
    if (shots) await page.screenshot({ path: `${shots}/affidavit-new-job-built.png` });
    assert.deepEqual(errors, []);
    await c.close();
  }
  console.log("PASS affidavit flow: ER03009 (08/14/26) -> earlier 2025 form; signing once saves both signatures to Drive; a fresh app copy opening ER05729 (09/17/26) -> new form, your signature already on, notary approves in one tap, package builds by itself");
} finally {
  await browser.close();
}
