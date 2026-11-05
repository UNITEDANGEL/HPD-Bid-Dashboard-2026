// Your papers (owner, 4 Nov: insurance / license dates, add by typing, saying or a photo, warn 30 days before) at iPhone size:
// add a paper with a date 10 days away and one 200 days away, the list shows the days left, the soon one is flagged,
// Home warns about it, a reload keeps them, Remove works. The photo read is faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const iso = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await c.route("**/api/drive/hpd-photo", (r) => r.fulfill({ json: { ai: true, text: `General liability insurance. Expires ${new Date(Date.now() + 50 * 86400000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/papers/`, { waitUntil: "load", timeout: 60000 });
  const S = (k) => page.locator(`[data-hpd-smoke="${k}"]`);
  await S("papers-name").waitFor();
  // Missing date is refused politely.
  await S("papers-name").fill("Contractor license");
  await S("papers-save").click();
  assert.match(await S("papers-msg").innerText(), /date/i);
  await S("papers-date").fill(iso(200));
  await S("papers-save").click();
  await S("papers-name").fill("General liability insurance");
  await S("papers-date").fill(iso(10));
  await S("papers-save").click();
  assert.equal(await S("papers-item").count(), 2);
  // Soonest first, flagged.
  assert.match(await S("papers-item").first().innerText(), /General liability insurance[\s\S]*1\d days? left|10 days left|9 days left/);
  assert.equal(await S("papers-item").first().getAttribute("data-state"), "soon");
  assert.equal(await S("papers-item").last().getAttribute("data-state"), "ok");
  // Photo: the date found on the paper fills the box.
  await S("papers-file").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await page.waitForFunction(() => /found a date/i.test(document.querySelector('[data-hpd-smoke="papers-msg"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(await S("papers-date").inputValue(), iso(50));
  // Home warns.
  await page.goto(`${baseUrl}/`, { waitUntil: "load", timeout: 60000 });
  await S("home-papers").waitFor();
  await page.waitForFunction(() => /days left/.test(document.querySelector('[data-hpd-smoke="home-papers"]')?.textContent || ""), null, { timeout: 10000 });
  assert.match(await S("home-papers").innerText(), /General liability insurance/);
  // Kept after a reload; Remove works.
  await page.goto(`${baseUrl}/papers/`, { waitUntil: "load", timeout: 60000 });
  await S("papers-item").first().waitFor();
  assert.equal(await S("papers-item").count(), 2);
  await S("papers-del").first().click();
  assert.equal(await S("papers-item").count(), 1);
  assert.deepEqual(errors, []);
  console.log("papers: ok");
} finally {
  await browser.close();
}
