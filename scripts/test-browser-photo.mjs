// 📷 Read a photo (owner, 3 Nov, pick 5 of making the chat smarter) at iPhone size. The AI is faked (no AI call, no
// cost). 1) "read a photo" in the chat points to 📷. 2) A photo through 📷 is made smaller on the phone (JPEG) and
// sent; the answer shows with a job card for the job it names and is said out loud. 3) Signed out: asks to sign in.
// 4) After 15 photos today: stops for the day (free allowance).
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const JOB = "EQ15239";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABlElEQVR4nBWRURFEMQjEkFAJSKgEJFQCEiohEiqhEpCAhEpAAhLuHt87THYjIgxBhSmYsAQXtoBwhCuEkMITSmhBZDAGOpgDG6yBD/aAwRncQQxy8AY16IGIMhRVpmLKUlzZCspRrhJKKk8ppRWRyZjoZE5ssiY+2RMmZ3InMcnJm9SkJyLGMNSYhhnLcGMbGMe4RhhpPKOMNkQWY6GLubDFWvhiL1icxV3EIhdvUYteiDjDUWc65izHne3gHOc64aTznHLaEdmMjW7mxjZr45u9YXM2dxOb3LxNbXoj8g2IfiWxDwT/wt8duBCQ8KCg/3rkMA56mAc7rIMf9vni53APccjDO9Shz9/DZVz0Mi92WRe/7Ps9P5d7iUte3qUuff8eghFoMAMLVuDBjg/lBDeIIIMXVNDx95CMRJOZWLIST3Z+4Ce5SSSZvKSSzr+Hx3joYz7ssR7+2O+reR73EY98vEc9+v09FKPQYhZWrMKLXd8op7hFFFm8ooquv4dmNNrMxprVeLP7m/A0t4kmm9dU080PiAJwEDqK72wAAAAASUVORK5CYII=", "base64"); // 16x16 test picture
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const sent = [];
let signedIn = true;
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/\/api\/drive\/hpd-photo/, (r) => {
    sent.push(r.request().postDataJSON());
    if (!signedIn) return r.fulfill({ status: 401, json: { error: "Sign in." } });
    return r.fulfill({ json: { ai: true, text: `This is a 24-hour notice for ${JOB}, due 11/4 at 10 AM. HPD wants the signed affidavit and invoice.` } });
  });
  await c.addInitScript(() => { window.__said = []; if (window.speechSynthesis) window.speechSynthesis.speak = (u) => { window.__said.push(u.text); setTimeout(() => u.onend?.(), 30); }; });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  const reply = () => page.locator('[data-hpd-smoke="fc-agent-reply"]').innerText();

  // 1) Asked in the chat.
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("read a photo");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => /Tap 📷 below/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-photo"]').count(), 1);
  // 2) A photo.
  await page.locator('[data-hpd-smoke="fc-agent-photo-input"]').setInputFiles({ name: "notice.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => /24-hour notice for/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(sent.length, 1);
  assert.match(sent[0].image, /^data:image\/jpeg;base64,[A-Za-z0-9+/=]{200,}$/, "made into a JPEG on the phone");
  assert.match(await page.locator('[data-hpd-smoke="fc-agent-heard"]').innerText(), /📷 Photo/);
  await page.locator(`[data-hpd-smoke="fc-chat-card"][data-id="${JOB}"]`).waitFor({ timeout: 5000 });
  await page.waitForFunction(() => window.__said.some((s) => /24-hour notice/.test(s)), null, { timeout: 5000 });
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem("hpd-photo-reads") || "{}").n);
  assert.equal(n, 1, "counted for today");
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/photo.png` }).catch(() => {});
  // 3) Signed out.
  signedIn = false;
  await page.locator('[data-hpd-smoke="fc-agent-photo-input"]').setInputFiles({ name: "notice.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => /signed in with Google/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(await page.locator('[data-hpd-smoke="fc-agent-signin"]').count(), 1);
  // 4) The day's limit.
  signedIn = true;
  await page.evaluate((d) => localStorage.setItem("hpd-photo-reads", JSON.stringify({ day: d, n: 15 })), new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()));
  const before = sent.length;
  await page.locator('[data-hpd-smoke="fc-agent-photo-input"]').setInputFiles({ name: "notice.png", mimeType: "image/png", buffer: png });
  await page.waitForFunction(() => /15 photos today/.test(document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || ""), null, { timeout: 15000 });
  assert.equal(sent.length, before, "nothing sent over the limit");
  assert.deepEqual(errors, []);
  console.log(`PASS photo: "read a photo" points to 📷; a photo went as a JPEG, the answer showed with a ${JOB} card and was said; signed out asks to sign in; after 15 today nothing is sent (${await reply().then((t) => t.slice(0, 40))}…)`);
} finally {
  await browser.close();
}
