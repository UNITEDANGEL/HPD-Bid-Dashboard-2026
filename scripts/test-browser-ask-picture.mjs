// Ask for a change with a picture (owner, 20 Nov): pick a screenshot, circle what you don't like with a finger,
// and it is saved with the request as a small JPEG; the request without a picture still works.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const posted = {};
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(context);
  await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, async (r) => {
    if (r.request().method() === "POST" && /\/override$/.test(r.request().url())) { const b = r.request().postDataJSON(); posted[b.key] = b.patch; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } });
  });
  await context.route(/geosearch\.planninglabs\.nyc|data\.cityofnewyork\.us/, (r) => r.fulfill({ status: 503, body: "" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load" });
  await page.locator('[data-hpd-smoke="fc-more-open"]').click();
  await page.locator('[data-hpd-smoke="fc-version-tag"]').click();
  const wn = page.locator('[data-hpd-smoke="fc-whatsnew"]');
  await wn.waitFor({ timeout: 10000 });
  // A screenshot made in the page itself, saved to a file for the picker.
  const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 400; const x = c.getContext("2d"); x.fillStyle = "#cfe8ff"; x.fillRect(0, 0, 600, 400); x.fillStyle = "#222"; x.fillRect(40, 40, 300, 60); return c.toDataURL("image/png").split(",")[1]; });
  const file = path.join(os.tmpdir(), "hpd-test-shot.png");
  fs.writeFileSync(file, Buffer.from(png, "base64"));
  await wn.locator('[data-hpd-smoke="fc-ask-shot-file"]').setInputFiles(file);
  const canvas = wn.locator('[data-hpd-smoke="fc-ask-shot-canvas"]');
  await canvas.waitFor({ state: "visible", timeout: 10000 });
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 100, "the picture shows");
  // Circle something with the pointer (red marks).
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.1, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();
  const red = await canvas.evaluate((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80) n++; return n; });
  assert.ok(red > 50, `red marks drawn (${red})`);
  await wn.locator('[data-hpd-smoke="fc-ask-change-text"]').fill("The big black bar is too big");
  await wn.locator('[data-hpd-smoke="fc-ask-change-save"]').click();
  await wn.locator('[data-hpd-smoke="fc-ask-change-status"]').waitFor({ timeout: 5000 });
  const req = Object.entries(posted).find(([k]) => k.startsWith("CHANGE-REQUEST-"))?.[1];
  assert.equal(req?.text, "The big black bar is too big");
  assert.match(req?.image || "", /^data:image\/jpeg;base64,/);
  assert.ok(req.image.length < 400000, `picture is small (${req.image.length})`);
  // The picture is gone after saving, and a request without one carries none.
  assert.equal(await canvas.isVisible(), false);
  await wn.locator('[data-hpd-smoke="fc-ask-change-text"]').fill("Plain request");
  await wn.locator('[data-hpd-smoke="fc-ask-change-save"]').click();
  await page.waitForTimeout(800);
  const plain = Object.values(posted).find((p) => p.text === "Plain request");
  assert.ok(plain && !plain.image, "no picture on a plain request");
  assert.deepEqual(errors, []);
  console.log(`PASS ask with a picture: screenshot picked, ${red} red mark pixels drawn, saved with the request as a small JPEG (${Math.round(req.image.length / 1024)} KB); plain request carries none`);
  await context.close();
} finally {
  await browser.close();
}
