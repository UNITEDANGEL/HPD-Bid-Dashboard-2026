// Bigger words switch (owner idea, 3 Nov), at iPhone size: the switch on More turns the bigger words on and off,
// the choice is remembered after a reload, and the page asks the phone for 120% text.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/more/`, { waitUntil: "load", timeout: 180000 });
  const sw = page.locator('[data-hpd-smoke="big-words-switch"]');
  await sw.waitFor({ timeout: 60000 });
  const big = () => page.evaluate(() => document.documentElement.hasAttribute("data-big-words"));
  assert.equal(await big(), false, "starts off");
  assert.equal(await sw.getAttribute("aria-pressed"), "false");
  await sw.tap();
  assert.equal(await big(), true, "turns on at once");
  assert.equal(await sw.getAttribute("aria-pressed"), "true");
  assert.match(await sw.innerText(), /ON/);
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-big-words")), "1");
  await page.reload({ waitUntil: "load" });
  await sw.waitFor({ timeout: 60000 });
  assert.equal(await big(), true, "still on after a reload");
  assert.equal(await sw.getAttribute("aria-pressed"), "true");
  const adjust = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return s.getPropertyValue("text-size-adjust") || s.getPropertyValue("-webkit-text-size-adjust");
  });
  assert.ok(adjust === "" || adjust.includes("120"), `text-size-adjust 120%: ${adjust}`);
  await sw.tap();
  assert.equal(await big(), false, "turns off");
  assert.equal(await page.evaluate(() => localStorage.getItem("hpd-big-words")), "0");
  assert.deepEqual(errors, []);
  console.log("big words switch: ok");
} finally {
  await browser.close();
}
