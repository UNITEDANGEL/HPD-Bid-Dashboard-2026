// ✏️ Change any idea before it is built + ↩ bring back skipped ideas + 📜 Everything the app does (owner, 14 Nov),
// at iPhone size, status server faked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const overrides = { "CLAUDE-HEARTBEAT": { at: ago(60), every: 9 } };
const posted = [];
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => {
    if (r.request().method() === "POST") { const b = r.request().postDataJSON(); posted.push(b); overrides[b.key] = { ...(overrides[b.key] || {}), ...b.patch }; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ok: true, overrides, accepted: [] } });
  });
  const page = await c.newPage();
  await page.addInitScript(() => { try { localStorage.setItem("hpd-claude-card", "big"); } catch { /* private mode */ } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
  while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
  await page.locator('[data-hpd-smoke="fc-claude-orb"]').click();
  await page.locator('[data-hpd-smoke="fc-agent-requests"]').click();
  const idea = page.locator('[data-hpd-smoke="fc-idea"]');
  await idea.first().waitFor({ timeout: 15000 });
  const id1 = await idea.first().getAttribute("data-id");

  // Change the words, save, then 👍 sends MY words.
  await idea.first().locator('[data-hpd-smoke="fc-idea-change"]').click();
  await page.locator('[data-hpd-smoke="fc-idea-edit-title"]').fill("My own idea title");
  await page.locator('[data-hpd-smoke="fc-idea-edit-why"]').fill("My own words about it.");
  await page.locator('[data-hpd-smoke="fc-idea-edit-save"]').click();
  assert.match(await idea.first().innerText(), /My own idea title/);
  assert.match(await idea.first().innerText(), /your words/);
  await idea.first().locator('[data-hpd-smoke="fc-idea-do"]').click();
  await page.waitForFunction(() => /Sent to Claude/.test(document.querySelector('[data-hpd-smoke="fc-ideas-note"]')?.textContent || ""), null, { timeout: 10000 });
  const req = posted.find((b) => String(b.key).startsWith("CHANGE-REQUEST-"));
  assert.equal(req.patch.text, "(idea) My own idea title: My own words about it.");

  // Skip one, bring it back.
  const id2 = await idea.first().getAttribute("data-id");
  assert.notEqual(id1, id2);
  await idea.first().locator('[data-hpd-smoke="fc-idea-skip"]').click();
  assert.equal(await page.locator(`[data-hpd-smoke="fc-idea"][data-id="${id2}"]`).count(), 0, "skipped leaves the list");
  await page.locator('[data-hpd-smoke="fc-ideas-skipped-toggle"]').click();
  await page.locator(`[data-hpd-smoke="fc-idea-restore"][data-id="${id2}"]`).click();
  assert.equal(await page.locator(`[data-hpd-smoke="fc-idea"][data-id="${id2}"]`).count(), 1, "brought back");

  // Everything the app does.
  await page.locator('[data-hpd-smoke="fc-features-toggle"]').click();
  await page.locator('[data-hpd-smoke="fc-feature"]').first().waitFor({ timeout: 15000 });
  assert.ok((await page.locator('[data-hpd-smoke="fc-feature"]').count()) > 20, "a long list");
  const text = (await page.locator('[data-hpd-smoke="fc-feature"] span').first().innerText()).slice(0, 40);
  await page.locator('[data-hpd-smoke="fc-feature-change"]').first().click();
  const v = await page.locator('[data-hpd-smoke="fc-ask-change-text"]').inputValue();
  assert.ok(v.startsWith("Change this: ") && v.includes(text.slice(0, 20)), v);
  assert.deepEqual(errors, []);
  console.log("ideas edit test passed");
} finally {
  await browser.close();
}
