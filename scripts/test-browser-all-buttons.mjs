// Sweep of the whole app at iPhone size: every page loads without errors, every same-site link works,
// every map button / menu item / chip / pill opens without errors, job cards have working links,
// and no screen shows missing-data text ("undefined", "NaN", "[object Object]").
// Runs sealed off: the live status server, Google Drive and email answer locally, so even buttons
// that save steps change nothing real. BASE_URL defaults to http://localhost:3000.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";

const baseUrl = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(baseUrl).origin;
const problems = [];
const checked = { pages: 0, links: 0, buttons: 0 };
const MISSING = /\b(undefined|NaN)\b|\[object Object\]/;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await routePrivate(context); // tenant data / invitation PDFs via the private route
await context.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
await context.route(/\/api\/drive\//, (r) => r.fulfill({ json: { configured: false, connected: false } }));
await context.route(/gmail\.googleapis\.com|www\.googleapis\.com\/upload/, (r) => r.abort());
// Pages opened in new tabs (Waze, Google Maps) are closed at once; their links are checked by shape.
const page = await context.newPage();
context.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });
let current = "";
page.on("pageerror", (e) => problems.push(`${current}: page error: ${String(e).slice(0, 160)}`));
page.on("dialog", (d) => d.dismiss().catch(() => {}));
page.on("response", (r) => {
  const url = r.url();
  // On a local static server: version.json / build_health.json are written by the deploy, and the page
  // data files (__next.<page>.__PAGE__.txt) are routed by Cloudflare Pages; both answer 200 on the live site.
  if (/localhost|127\.0\.0\.1/.test(origin) && /\/version\.json|\/data\/build_health\.json|\/__next\.[\w.-]+\.txt/.test(url)) return;
  if (url.startsWith(origin) && r.status() >= 400 && !/\/api\//.test(url)) problems.push(`${current}: ${r.status()} ${url.replace(origin, "")}`);
});

async function scanText(where) {
  const text = await page.evaluate(() => document.body.innerText);
  const hit = text.match(MISSING);
  if (hit) problems.push(`${where}: shows "${hit[0]}" … ${text.slice(Math.max(0, hit.index - 40), hit.index + 30).replace(/\s+/g, " ")}`);
}

async function checkLinks(where) {
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href));
  for (const href of [...new Set(hrefs)]) {
    if (!href.startsWith(origin) || /\/api\//.test(href)) continue;
    checked.links += 1;
    const status = await page.evaluate(async (u) => { try { return (await fetch(u, { method: "HEAD" })).status; } catch { return 0; } }, href);
    if (status >= 400 || status === 0) problems.push(`${where}: link ${status} ${href.replace(origin, "")}`);
  }
  const external = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") || "").filter((h) => /^https?:/.test(h) && !h.startsWith(location.origin)));
  for (const href of external) {
    if (/waze\.com\/ul\?ll=-?\d/.test(href) || /google\.com\/maps/.test(href) || /^https:\/\/(drive|docs|mail|accounts)\.google\.com|github\.com|[\w-]+\.nyc\.gov|hpdonline\.nyc\.gov|cloudflare|openstreetmap|openfreemap|openmaptiles|leafletjs/.test(href)) continue;
    problems.push(`${where}: unexpected outside link ${href.slice(0, 120)}`);
  }
}

async function visit(path, waitFor) {
  current = path;
  const response = await page.goto(baseUrl + path, { waitUntil: "load", timeout: 180000 });
  checked.pages += 1;
  if (!response || response.status() >= 400) problems.push(`${path}: page answered ${response?.status()}`);
  if (waitFor) await page.waitForFunction(waitFor, null, { timeout: 120000 }).catch(() => problems.push(`${path}: content didn't load`));
  await page.waitForTimeout(1500);
  await scanText(path);
  await checkLinks(path);
}

async function tap(where, locator, after = 700) {
  const target = typeof locator === "string" ? page.locator(locator).first() : locator;
  if (!(await target.count()) || !(await target.isVisible().catch(() => false))) { problems.push(`${where}: button not found/visible`); return false; }
  checked.buttons += 1;
  await target.click({ timeout: 10000 }).catch((e) => problems.push(`${where}: click failed: ${String(e).slice(0, 100)}`));
  await page.waitForTimeout(after);
  await scanText(where);
  return true;
}

try {
  // 1. Every page in the dashboard menu and the field app's menu.
  const pages = ["/", "/jobs/", "/fetcher/", "/automation/", "/paperwork/", "/outputs/", "/system-status/", "/storage/", "/more/", "/alerts/", "/field-command/", "/invoice-generator/"];
  for (const p of pages) await visit(p);

  // 2. Dashboard: month picker and every filter chip.
  await visit("/overview/", () => /HPD records loaded/.test(document.body.innerText)); // the full dashboard (home is the new start screen)
  current = "dashboard";
  const months = await page.locator('[data-hpd-smoke="dashboard-month-select"] option').evaluateAll((o) => o.map((x) => x.value));
  for (const m of months.slice(0, 3)) { await page.selectOption('[data-hpd-smoke="dashboard-month-select"]', m); checked.buttons += 1; await page.waitForTimeout(300); await scanText(`dashboard month ${m}`); }
  await page.selectOption('[data-hpd-smoke="dashboard-month-select"]', "all");
  await tap("dashboard Filters", '[data-hpd-smoke="dashboard-filters-toggle"]');
  for (const chip of await page.locator(".filter-chips button").all()) { checked.buttons += 1; await chip.click(); await page.waitForTimeout(200); }
  await scanText("dashboard filters");

  // 3. Field map: every round button, menu item, chip and pill.
  await visit("/map/?view=all&map=1", () => document.querySelectorAll(".leaflet-marker-icon, .fc-pin").length > 50);
  current = "map";
  const close = async () => { for (const sel of ['[data-hpd-smoke="fc-stats-sheet"] header button', ".fc-summary-sheet header button", '[aria-label="Close appointments"]', ".fc-route-toggle[aria-expanded=true]"]) { const b = page.locator(sel).first(); if (await b.count() && await b.isVisible().catch(() => false)) await b.click().catch(() => {}); } await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(400); };
  await tap("map: route", '[data-hpd-smoke="fc-route-open"]', 2500); await close();
  await tap("map: appointments", '[aria-label="Today\'s appointments"]'); await close();
  await tap("map: stats", '[data-hpd-smoke="fc-stats-open"]');
  for (const p of ["today", "week", "month"]) await tap(`stats: ${p}`, `[data-hpd-smoke="fc-stats-period-${p}"]`, 300);
  await close();
  await tap("map: layers", '[aria-label="Toggle map style"]'); await tap("map: layers back", '[aria-label="Toggle map style"]');
  for (const chip of await page.locator(".fc-quick-chips button").all()) { if (await chip.isVisible().catch(() => false)) { checked.buttons += 1; await chip.click().catch(() => {}); await page.waitForTimeout(250); } }
  await scanText("map chips");
  // Close out / 2nd try: round buttons that open a list sheet; "needs a check" is still a pill.
  // One round Jobs button (21 Oct) holds Close out / 2nd try.
  for (const [btn, sheet] of [['[data-hpd-smoke="fc-jobs-open"]', '[data-hpd-smoke="fc-jobs"]']]) {
    if (await page.locator(btn).first().count()) { await tap(`map button ${btn}`, btn); await checkLinks(`list ${sheet}`); await tap(`list close ${sheet}`, `${sheet} [data-hpd-smoke="fc-jobs-close"]`, 300); }
  }
  for (const pill of ['[data-hpd-smoke="fc-data-check"] button']) {
    if (await page.locator(pill).first().count()) { await tap(`map pill ${pill}`, pill); await checkLinks(`map pill ${pill}`); await tap(`map pill close ${pill}`, pill, 300); }
  }
  const menuButton = page.locator('[aria-label="Show map controls"], [aria-label*="menu" i]').first();
  const menuItems = ["fc-summary-open", "fc-stats-menu-open", "fc-tracker-open", "fc-autopilot-open", "fc-test-job-open"];
  for (const item of menuItems) {
    // Open the menu until the item shows (a tap on the menu button toggles it, so a menu left open would close).
    const entry = page.locator(`[data-hpd-smoke="${item}"]`);
    for (let k = 0; k < 3 && !(await entry.isVisible().catch(() => false)); k++) { if (await menuButton.count()) await menuButton.click().catch(() => {}); await page.waitForTimeout(500); }
    await entry.scrollIntoViewIfNeeded().catch(() => {});
    await tap(`menu: ${item}`, `[data-hpd-smoke="${item}"]`, 1200);
    if (item === "fc-test-job-open") { await checkLinks("TEST-0001 card"); } else await close();
  }

  // 4. Job cards: the test job and a real job, every link checked.
  for (const id of ["TEST-0001", "EQ21462"]) {
    await visit(`/map/?omo=${id}&view=all`, () => !!document.querySelector("#fc-job-card"));
    current = `${id} card`;
    const card = await page.locator("#fc-job-card").innerText();
    for (const want of [id, "full text"]) if (!card.includes(want)) problems.push(`${id} card: missing "${want}"`);
    const itb = page.locator('[data-hpd-smoke="jc-itb-page"]').first();
    if (await itb.count()) { await tap(`${id}: ITB page`, itb, 1500); await scanText(`${id} ITB page`); await page.keyboard.press("Escape").catch(() => {}); }
    else problems.push(`${id} card: no ITB page button`);
    const waze = await page.locator('[data-hpd-smoke="jc-step-waze"]').first().getAttribute("href").catch(() => null);
    if (!/^https:\/\/waze\.com\/ul\?/.test(waze || "")) problems.push(`${id} card: Waze link missing or wrong (${waze})`);
    checked.buttons += await page.locator("#fc-job-card button").count();
  }

  // 5. Paperwork page for a real job: loads with its amount and address.
  await visit("/paperwork/?job=EQ21462&outcome=work_completed", () => /EQ21462/.test(document.body.innerText) && /\$3,400\.00/.test(document.body.innerText));

  console.log(`Checked ${checked.pages} pages, ${checked.links} same-site links, ${checked.buttons} buttons/chips.`);
  if (problems.length) {
    console.log(`PROBLEMS (${problems.length}):`);
    for (const p of [...new Set(problems)]) console.log(`  - ${p}`);
  }
  assert.equal(problems.length, 0, "see problems above");
  console.log("PASS all buttons: every page, link, button, chip and pill works; no missing-data text");
} finally {
  await browser.close();
}
