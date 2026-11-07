// 🗣 The robot starts talking right away (idea list, 6 Nov), the AI faked: the phone asks for the answer word by word
// (stream: true); the first sentence is said on its own, then only the rest, queued after it (not cut off, not said
// twice); the whole answer and its "Ask next" buttons show. A plain JSON answer (older server) still works.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const pieces = ["You have two ", "stops today. ", "The first one starts ", "at nine. Bring the door closer.", "\nASK: What should I buy?"];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  const asked = [];
  let plain = false;
  await c.route(/\/api\/drive\/hpd-ask/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    asked.push(b);
    if (plain || !b.stream) return r.fulfill({ json: { ai: true, text: "Plain answer here. Nothing streamed." } });
    const text = pieces.join("").replace("\nASK:", "\nASK:");
    const body = [...pieces.map((t) => JSON.stringify({ t })), JSON.stringify({ done: true, ai: true, model: "fake", text })].join("\n") + "\n";
    return r.fulfill({ status: 200, headers: { "Content-Type": "application/x-ndjson; charset=utf-8" }, body });
  });
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => (r.request().method() === "POST" ? r.fulfill({ json: { ok: true } }) : r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } })));
  await c.addInitScript(() => {
    window.__said = []; window.__cancels = 0;
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (u) => { window.__said.push({ text: u.text, cancelsBefore: window.__cancels }); setTimeout(() => u.onend?.(), 20); };
      window.speechSynthesis.cancel = () => { window.__cancels++; };
    }
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  await page.evaluate(() => { window.__said = []; });
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("Explain how HPD decides who wins a bid between two vendors?");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => (document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").includes("Bring the door closer."), null, { timeout: 15000 }).catch(async (e) => { throw new Error(`got: ${await page.locator(".fc-agent").textContent().catch(() => "none")} asked=${asked.length} said=${JSON.stringify(await page.evaluate(() => window.__said))}`); });
  await page.waitForTimeout(800);
  assert.equal(asked[0].stream, true, "asked word by word");
  const reply = await page.locator('[data-hpd-smoke="fc-agent-reply"]').textContent();
  assert.match(reply, /You have two stops today\. The first one starts at nine\. Bring the door closer\./);
  assert.ok(!/ASK:|…/.test(reply), reply);
  assert.match(await page.locator(".fc-agent").textContent(), /What should I buy\?/);
  const said = await page.evaluate(() => window.__said);
  const texts = said.map((s) => s.text);
  const i = texts.indexOf("You have two stops today.");
  assert.ok(i >= 0, JSON.stringify(texts));
  assert.equal(texts[i + 1], "The first one starts at nine. Bring the door closer.", JSON.stringify(texts));
  assert.equal(said[i + 1].cancelsBefore, said[i].cancelsBefore, "the rest is queued after the first sentence, not cutting it off");
  assert.equal(texts.filter((t) => /You have two stops/.test(t)).length, 1, "the first sentence said once");
  await page.locator('[data-hpd-smoke="fc-agent-close"]').click();

  // An older server answers plain JSON: still answered and said whole.
  plain = true;
  await page.evaluate(() => { window.__said = []; });
  await page.locator('[data-hpd-smoke="fc-chatbar-input"]').fill("Why does HPD ask for the affidavit to be notarized?");
  await page.locator('[data-hpd-smoke="fc-chatbar-send"]').click();
  await page.waitForFunction(() => (document.querySelector('[data-hpd-smoke="fc-agent-reply"]')?.textContent || "").includes("Plain answer here."), null, { timeout: 15000 });
  await page.waitForTimeout(500);
  assert.ok((await page.evaluate(() => window.__said)).some((s) => s.text === "Plain answer here. Nothing streamed."));
  assert.deepEqual(errors, []);
  console.log("PASS talks right away: asked word by word, first sentence said on its own, the rest queued after it (said once), whole answer + Ask next shown; plain JSON still works");
} finally {
  await browser.close();
}
