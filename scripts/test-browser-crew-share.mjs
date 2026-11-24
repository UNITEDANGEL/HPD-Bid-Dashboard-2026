// 👷 Send a job to a worker (idea list): the job card's button opens the share sheet (faked) with the job number, the
// address, the work, the photos HPD still needs, the super saved for the building and the map link; no tenant name or
// phone unless "add the tenant's name and phone" is ticked. Nothing is sent by the app.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { routePrivate } from "./private-route-for-tests.mjs";
import { loadLib } from "./daily-report.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const { buildingKey } = await loadLib("building-history");
const JOB = "EQ15239";
const job = (await (await fetch(`${baseUrl}/data/COA_Fetcher_2026.json`)).json()).find((j) => j.OMO === JOB);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await routePrivate(c);
  await c.route(/hpd-status-worker\.[^/]+\.workers\.dev/, (r) => r.fulfill({ json: { ok: true, overrides: {}, accepted: [] } }));
  await c.addInitScript((k) => {
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    localStorage.setItem("hpd-building-contacts", JSON.stringify({ [k]: { name: "Super Jose", phone: "2125550147", note: "basement door", savedAt: "2026-11-08T12:00:00Z" } }));
  }, buildingKey(job.BuildingAddress));
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  const tenantPhone = ((await page.locator('[data-hpd-smoke="jc-tenant-call"]').getAttribute("href").catch(() => "")) || "").replace(/^tel:/, "").replace(/\D/g, "").slice(-10);
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const t1 = await page.evaluate(() => window.__shared.text);
  // 20 Nov: the job card link comes first (the phone opens the first link), no map link (the card has Navigate).
  assert.match(t1, new RegExp(`^HPD job ${JOB}\\n👷 Open your job card \\(photos, call, navigate\\): https?://\\S+/worker/#o=\\S+\\n📍 1207 1 AVENUE`));
  assert.match(t1, /\nThe work:\n• /);
  // 👷 Finish-by date (plan, 21 Nov): HPD's completion date in plain words with the days left / late.
  assert.match(t1, /\n⏰ HPD expects it done by (Sun|Mon|Tue|Wed|Thu|Fri|Sat), [A-Z][a-z]{2} \d{1,2}(, \d{4})? \((\d+ days? (left|late)|due today)\)\n/);
  assert.match(t1, /📸 Photos HPD needs: before photos, before video, after photos, after video\./);
  assert.match(t1, /🏢 Building: Super Jose \(212\) 555-0147 \(basement door\)/);
  assert.ok(!/Map: https:/.test(t1), "no map link to tap by mistake");
  // 20 Nov: the tenant's name and phone go in by default; HPD's full description and where the work is too.
  if (tenantPhone) assert.ok(t1.replace(/\D/g, "").includes(tenantPhone), "tenant phone by default");
  assert.match(t1, /🔔 Tenant: /);
  assert.match(t1, /\nHPD's full description:\n\S/);
  if (/PUBLIC HAL|APT|APARTMENT|KITCHEN|BATHROOM|STAIR|ENTRANCE/i.test(job.JobDescription || "")) assert.match(t1, /\n🚪 Where: (Inside the apartment|Public part of the building)/);
  // 20 Nov (owner: "the link is too long ... make it a smaller nicer link"): only the job number (+ apartment, tenant,
  // super) is in the link; opening it shows the job with the address and HPD's full description.
  const href = /https?:\/\/\S+\/worker\/#o=\S+/.exec(t1)[0];
  assert.ok(href.length < 200, `worker link is short (${href.length}): ${href}`);
  assert.ok(href.includes(`#o=${JOB}`), "job number in the link");
  const wp = await page.context().newPage();
  await wp.goto(href.replace(/^https?:\/\/[^/]+/, baseUrl), { waitUntil: "load" });
  await wp.locator('[data-hpd-smoke="worker-job"]').waitFor({ timeout: 30000 });
  await wp.waitForFunction(() => (document.querySelector('[data-hpd-smoke="worker-full"]')?.textContent || "").length > 30, null, { timeout: 30000 });
  { const body = await wp.locator("body").innerText(); assert.ok(/Before photos/.test(body) && /After photos/.test(body), "before and after spots for the worker"); }
  assert.doesNotMatch(await wp.locator('[data-hpd-smoke="worker-address"]').innerText(), /Loading|not found/);
  assert.match(await wp.locator('[data-hpd-smoke="worker-finish-by"]').innerText(), /⏰ HPD expects it done by \w{3}, \w{3} \d{1,2}.*\((\d+ days? (left|late)|due today)\)/);
  await wp.close();
  assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /Sent to your worker/);
  // 📄 HPD's pages for the worker (21 Nov): drawn from the invitation PDF (signed in), then shared as pictures.
  if (job.ITBFile) {
    await page.locator('[data-hpd-smoke="jc-crew-pages"]').click();
    const ready = await page.waitForFunction(() => { const b = document.querySelector('[data-hpd-smoke="jc-crew-pages"]'); return b?.getAttribute("data-ready") || (/Couldn't open/.test(document.querySelector('[data-hpd-smoke="jc-crew-msg"]')?.textContent || "") ? "none" : ""); }, null, { timeout: 60000 }).then((h) => h.jsonValue());
    if (ready === "none") console.log("HPD pages: PDF not readable here (no key)");
    if (ready !== "none") {
      assert.ok(Number(ready) >= 1, "HPD pages drawn");
      await page.evaluate(() => { window.__shared = null; });
      await page.locator('[data-hpd-smoke="jc-crew-pages"]').click();
      await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
      const shared = await page.evaluate(() => ({ names: (window.__shared.files || []).map((f) => f.name), text: window.__shared.text }));
      assert.equal(shared.names.length, Number(ready));
      assert.ok(shared.names.every((n) => /^EQ15239-HPD-page-\d\.jpg$/.test(n)), shared.names.join(","));
      assert.match(shared.text, /show them to the tenant/);
      console.log(`HPD pages shared: ${shared.names.join(", ")}`);
      // 24 Nov (owner: "fix send to worker, he should be able to see the actual pdf work description and the 2nd page"):
      // once the pages are ready, 👷 Send to a worker sends the job and HPD's pages together in one share.
      assert.match(await page.locator('[data-hpd-smoke="jc-crew-send"]').innerText(), /Send to a worker \+ HPD's \d page/);
      await page.evaluate(() => { window.__shared = null; });
      await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
      await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
      const both = await page.evaluate(() => ({ names: (window.__shared.files || []).map((f) => f.name), text: window.__shared.text }));
      assert.equal(both.names.length, Number(ready), "HPD's pages go with the job");
      assert.match(both.text, /\/worker\/#o=EQ15239/);
      assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /the job \+ HPD's \d pages? \(work description and tenant page\)/);
    }
  }
  // Untick the tenant: left out.
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('[data-hpd-smoke="jc-crew-tenant"]').uncheck();
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const t2 = await page.evaluate(() => window.__shared.text);
  assert.ok(!/Tenant:/.test(t2) && (!tenantPhone || !t2.replace(/\D/g, "").includes(tenantPhone)), "no tenant when unticked");
  // 📥 The worker's photos back into the job card: named Before / After by the worker's page, sorted by their name
  // (even from the After button), saved on the job (backed up to Drive by itself).
  const jpg = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 320; c.height = 240; const g = c.getContext("2d"); for (let i = 0; i < 40; i++) { g.fillStyle = `hsl(${i * 9},70%,${40 + (i % 5) * 8}%)`; g.fillRect((i * 37) % 320, (i * 23) % 240, 60, 40); } return c.toDataURL("image/jpeg", 0.9).split(",")[1]; });
  const buf = Buffer.from(jpg, "base64");
  const chooser = page.waitForEvent("filechooser");
  await page.locator('[data-hpd-smoke="jc-crew-in-after"]').click();
  await (await chooser).setFiles([{ name: `${JOB}-Before-photos-1.jpg`, mimeType: "image/jpeg", buffer: buf }, { name: `${JOB}-After-photos-1.jpg`, mimeType: "image/jpeg", buffer: buf }, { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: buf }]);
  await page.waitForFunction(() => /Saved on job/.test(document.querySelector('[data-hpd-smoke="jc-crew-msg"]')?.textContent || ""), null, { timeout: 20000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /1 before \+ 2 after\. They go to your Drive \(HPD Photo Backup \/ EQ15239\)/);
  assert.deepEqual(errors, []);
  console.log("PASS crew share: worker photos come back into the job card (Before / After by name), job, address, the work, photos still needed, the super, map link; the tenant by default (untick leaves it out), where the work is, HPD's full description, before/after spots, the finish-by date, HPD's pages as pictures");
} finally {
  await browser.close();
}
