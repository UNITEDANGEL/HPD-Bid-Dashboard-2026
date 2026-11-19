// ✅ Upgrades done (owner, 15 Nov: "i need a list in the app of all ideas upgrades we have done to this app, i should be
// able to edit them"), at iPhone size: All → ✅ Upgrades done lists every What's new item by day; find; ✏️ Edit saves
// your words (kept after reopening the app), ↩ goes back; 🗑 Remove and ↩ Bring back; ＋ Add your own (on today);
// 💬 Ask Claude to change it fills the request box. Status server faked; nothing is sent.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const open = async () => {
    await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 3, null, { timeout: 120000 });
    while (await page.locator('[data-hpd-smoke="fc-critical-snooze"]').count()) await page.locator('[data-hpd-smoke="fc-critical-snooze"]').click();
    await page.locator('[data-hpd-smoke="fc-more-open"]').click();
    await page.locator('[data-hpd-smoke="fc-more-upgrades"]').click();
    await page.locator('[data-hpd-smoke="fc-feature"]').first().waitFor({ timeout: 15000 });
  };
  await page.goto(`${baseUrl}/map/?view=all&map=1`, { waitUntil: "load", timeout: 180000 });
  await open();
  const sheet = page.locator('[data-hpd-smoke="fc-upgrades"]');
  const items = sheet.locator('[data-hpd-smoke="fc-feature"]');
  const total = await items.count();
  assert.ok(total > 50, `every upgrade listed (${total})`);
  assert.match(await sheet.locator("header strong").innerText(), new RegExp(`Upgrades done \\(${total}\\)`));
  assert.ok((await sheet.locator('[data-hpd-smoke="fc-upgrades-day"]').count()) > 5, "grouped by day");

  // One area at a time (18 Nov): each button shows only that part's upgrades, with its count; All brings back every one.
  for (const area of ["bids", "jobs", "notices", "paperwork", "helper"]) {
    const btn = sheet.locator(`[data-hpd-smoke="fc-upgrades-area-${area}"]`);
    const n = Number(await btn.locator("em").innerText());
    assert.ok(n > 5 && n < total, `${area}: ${n} of ${total}`);
    await btn.click();
    assert.equal(await btn.getAttribute("aria-pressed"), "true");
    assert.equal(await items.count(), n, `${area} shows only its ${n}`);
  }
  await sheet.locator('[data-hpd-smoke="fc-upgrades-area-all"]').click();
  assert.equal(await items.count(), total, "All: every upgrade again");

  // Find.
  await sheet.locator('[data-hpd-smoke="fc-upgrades-find"]').fill("profit after HPD paid");
  assert.match(await sheet.locator('[data-hpd-smoke="fc-upgrades-found"]').innerText(), /^\d+ found/);
  assert.ok((await items.count()) >= 1 && (await items.count()) < total);
  await sheet.locator('[data-hpd-smoke="fc-upgrades-find"]').fill("");

  // Edit the first one: your words, kept after reopening.
  const first = items.first();
  const id = await first.getAttribute("data-id");
  const original = await first.locator("span").first().innerText();
  await first.locator('[data-hpd-smoke="fc-upgrade-edit"]').click();
  await sheet.locator('[data-hpd-smoke="fc-upgrade-edit-text"]').fill("My words for this upgrade.");
  await sheet.locator('[data-hpd-smoke="fc-upgrade-edit-save"]').click();
  const row = sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id}"]`);
  assert.match(await row.innerText(), /My words for this upgrade\. · your words/);

  // Remove the second one; it leaves the list and comes back.
  const id2 = await items.nth(1).getAttribute("data-id");
  await items.nth(1).locator('[data-hpd-smoke="fc-upgrade-remove"]').click();
  assert.equal(await sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id2}"]`).count(), 0, "removed");
  assert.match(await sheet.locator("header strong").innerText(), new RegExp(`\\(${total - 1}\\)`));

  // Add your own.
  await sheet.locator('[data-hpd-smoke="fc-upgrades-add"]').click();
  await sheet.locator('[data-hpd-smoke="fc-upgrades-add-text"]').fill("Painted the truck logo (my own note)");
  await sheet.locator('[data-hpd-smoke="fc-upgrades-add-save"]').click();
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/upgrades-done.png` });
  assert.match(await items.first().innerText(), /Painted the truck logo \(my own note\) · added by you/);

  // Reopen the app: all kept.
  await page.reload({ waitUntil: "load" });
  await open();
  assert.match(await sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id}"]`).innerText(), /My words for this upgrade\./);
  assert.equal(await sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id2}"]`).count(), 0, "still removed");
  assert.match(await sheet.innerText(), /Painted the truck logo/);
  // Back to the original words; bring the removed one back.
  await sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id}"] [data-hpd-smoke="fc-upgrade-edit"]`).click();
  await sheet.locator('[data-hpd-smoke="fc-upgrade-edit-undo"]').click();
  assert.equal((await sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id}"] span`).first().innerText()).trim(), original.trim());
  await sheet.locator('[data-hpd-smoke="fc-upgrades-removed-toggle"]').click();
  await sheet.locator(`[data-hpd-smoke="fc-upgrade-restore"][data-id="${id2}"]`).click();
  assert.equal(await sheet.locator(`[data-hpd-smoke="fc-feature"][data-id="${id2}"]`).count(), 1, "brought back");

  // Ask Claude to change one: the request box opens with it.
  await items.nth(3).locator('[data-hpd-smoke="fc-feature-change"]').click();
  const v = await page.locator('[data-hpd-smoke="fc-ask-change-text"]').inputValue();
  assert.ok(v.startsWith("Change this: "), v);
  assert.equal(await sheet.count(), 0, "the list closes for the request box");
  assert.deepEqual(errors, []);
  console.log(`PASS upgrades done: ${total} upgrades by day; find; edit kept after reopening + back to original; remove + bring back; add your own; ask Claude to change one`);
} finally {
  await browser.close();
}
