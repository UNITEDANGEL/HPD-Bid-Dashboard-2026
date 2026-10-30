// Every affidavit date can be changed by hand (owner, 30 Oct: "I should be able to change any date on the refused access,
// no access, work completed, any affidavit date ... you locked me out of the refused access date"), at iPhone size:
// Refused access and Work completed by others have a date box on the card (it was only a text box under More details);
// No Access has both attempts; Work completed has started / completed. Each change shows at once.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const shots = process.env.SHOTS || "";
const JOB = "EQ15239";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const open = async (outcome) => {
    await page.goto(`${baseUrl}/paperwork/?job=${JOB}&outcome=${outcome}`, { waitUntil: "load", timeout: 180000 });
    await page.waitForFunction((j) => document.body.innerText.includes(j), JOB, { timeout: 60000 });
  };
  const setDate = async (smoke, iso) => {
    const box = page.locator(`[data-hpd-smoke="${smoke}"]`);
    await box.waitFor({ timeout: 20000 });
    assert.equal(await box.isEditable(), true, `${smoke} can be changed`);
    await box.fill(iso);
    assert.equal(await box.inputValue(), iso, `${smoke} keeps ${iso}`);
  };
  // Refused access: the date box on the card.
  await open("REFUSED_ACCESS");
  await setDate("paperwork-refused-date", "2026-10-20");
  assert.match(await page.locator('[data-hpd-smoke="paperwork-date-card"]').innerText(), /Refused on 10\/20\/26/i);
  await setDate("paperwork-refused-date", "2026-10-22");
  assert.match(await page.locator('[data-hpd-smoke="paperwork-date-card"]').innerText(), /10\/22\/26/, "changed again");
  if (shots) await page.screenshot({ path: `${shots}/affidavit-refused-date.png` });
  // The date that prints: sign, notarize, build the package and read the affidavit PDF's text.
  await page.locator('[data-hpd-smoke="paperwork-signature-draw"]').click();
  const pad = await page.locator('[data-hpd-smoke="paperwork-signature-pad"]').boundingBox();
  await page.mouse.move(pad.x + 30, pad.y + 100);
  await page.mouse.down();
  for (let i = 0; i <= 20; i += 1) await page.mouse.move(pad.x + 30 + i * 12, pad.y + 80 + Math.sin(i / 2) * 30);
  await page.mouse.up();
  await page.locator('[data-hpd-smoke="paperwork-signature-save"]').click();
  await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click();
  await page.getByText(/isn't notarized yet/).first().waitFor({ timeout: 15000 });
  await page.locator('[data-hpd-smoke="paperwork-notary-quick"]').click();
  await page.locator('[data-hpd-smoke="paperwork-notary-preview"]').waitFor({ timeout: 10000 });
  await page.locator('[data-hpd-smoke="paperwork-notary-approve"]').click();
  await page.waitForFunction(() => !!document.querySelector('[data-hpd-smoke="paperwork-package-review"]') || (() => { const b = document.querySelector('[data-hpd-smoke="paperwork-generate-pdf-only"]'); return !!b && !b.disabled && !!b.offsetParent; })(), null, { timeout: 90000 });
  if (!(await page.locator('[data-hpd-smoke="paperwork-package-review"]').count())) {
    await page.waitForTimeout(1500);
    if (!(await page.locator('[data-hpd-smoke="paperwork-package-review"]').count())) await page.locator('[data-hpd-smoke="paperwork-generate-pdf-only"]').click({ timeout: 5000 }).catch(() => {});
  }
  await page.locator('[data-hpd-smoke="paperwork-package-review"]').waitFor({ timeout: 60000 }).catch(async (e) => {
    await page.screenshot({ path: `${shots || "."}/affidavit-stuck.png`, fullPage: true });
    console.log("STUCK:", (await page.locator("[role=alert], .paperwork-status, [data-hpd-smoke$='-status']").allInnerTexts()).join(" | ").slice(0, 800));
    throw e;
  });
  const href = await page.locator('[data-hpd-smoke="paperwork-save-pdf"]').getAttribute("href");
  const b64 = await page.evaluate(async (url) => { const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer()); let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s); }, href);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: new Uint8Array(Buffer.from(b64, "base64")) }).promise;
  let printed = "";
  for (let n = 1; n <= pdf.numPages; n += 1) printed += " " + (await (await pdf.getPage(n)).getTextContent()).items.map((it) => it.str).join(" ");
  // The past date on the affidavit (date refused) and the invoice (invoice date, start, completed): it was today's date
  // for the invoice start before, which stopped the package.
  const times = (printed.match(/10\/22\/(20)?26/g) || []).length;
  assert.ok(times >= 4, `the refusal date printed ${times}x (affidavit + invoice date, start, completed): ${printed.slice(0, 600)}`);
  // Work completed by others.
  await open("COMPLETED_BY_OTHERS");
  await setDate("paperwork-by-others-date", "2026-10-21");
  assert.match(await page.locator('[data-hpd-smoke="paperwork-date-card"]').innerText(), /Found done on 10\/21\/26/i);
  // No Access: both attempts.
  await open("NO_ACCESS");
  await setDate("paperwork-attempt-1", "2026-10-19");
  await setDate("paperwork-attempt-2", "2026-10-23");
  // Work completed: started / completed.
  await open("WORK_COMPLETED");
  await setDate("paperwork-work-start", "2026-10-18");
  await setDate("paperwork-work-complete", "2026-10-24");
  assert.deepEqual(errors, []);
  console.log("PASS affidavit dates: Refused access (date box on the card, changed twice, and the new date prints on the signed, notarized PDF), Work completed by others, No Access 1st / 2nd attempt and Work completed start / complete all change by hand");
  await c.close();
} finally {
  await browser.close();
}
