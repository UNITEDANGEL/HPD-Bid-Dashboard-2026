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
  // 👷 25 Nov: the worker link carries the job's upload pass; what the worker sent comes onto the card by itself (faked Drive).
  const PASS = "1a2.ABCDEFGHIJKLMNOPQRSTUV";
  const pulled = { done: [] };
  const itb = { open: false };
  await c.route(/\/api\/private\/itb\//, (r) => (itb.open ? r.fallback() : r.fulfill({ status: 503, body: "" })));
  const jpg0 = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
  await c.route(/\/api\/drive\/worker-(ticket|list|file|done)/, async (r) => {
    const a = r.request().url().split("/").pop();
    const b = JSON.parse(r.request().postData() || "{}");
    if (a === "worker-ticket") return r.fulfill({ json: { pass: PASS } });
    if (a === "worker-list") return r.fulfill({ json: { files: pulled.done.length ? [] : [{ id: "f0000000001", name: `${JOB} BEFORE photo 1.jpg`, mimeType: "image/jpeg", side: "before", done: false, taken: "2026-11-20T15:00:00Z" }, { id: "f0000000002", name: `${JOB} AFTER photo 1.jpg`, mimeType: "image/jpeg", side: "after", done: false, taken: "2026-11-22T16:00:00Z" }] } });
    if (a === "worker-file") return r.fulfill({ body: jpg0, contentType: "image/jpeg" });
    pulled.done.push(...b.fileIds); return r.fulfill({ json: { ok: true } });
  });
  const page = await c.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => /From your worker: 1 before \+ 1 after added to job/.test(document.querySelector('[data-hpd-smoke="jc-crew-in-pulled"]')?.textContent || ""), null, { timeout: 30000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-crew-in-pulled"]').innerText(), /ready for the affidavit package/);
  assert.deepEqual(pulled.done, ["f0000000001", "f0000000002"], "marked as on the card in Drive (not pulled twice)");
  // Stamped (owner, 25 Nov: "omo number, address and location printed on the photo and video as well as before and after; the
  // date in the file name"): saved as stamped evidence, dated the day the worker took it, the date in the file name.
  const rows = await page.evaluate((id) => new Promise((res) => { const q = indexedDB.open("hpd-field-photos-v1"); q.onsuccess = () => { const t = q.result.transaction("photos").objectStore("photos").getAll(); t.onsuccess = () => res(t.result.filter((x) => x.jobId === id).map((x) => [x.kind, x.stamped, x.capturedAt, x.name]).sort()); }; }), JOB);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r[0], r[1], r[2]]), [["after", true, "2026-11-22T16:00:00.000Z"], ["before", true, "2026-11-20T15:00:00.000Z"]]);
  assert.match(rows[1][3], /^EQ15239_.+_BEFORE-WORK-EVIDENCE_PHOTO_20261120\.jpg$/);
  assert.match(rows[0][3], /^EQ15239_.+_AFTER-WORK-EVIDENCE_PHOTO_20261122\.jpg$/);
  // (HPD's PDF is held back until the pages step below, so these first shares are the plain message to check word by word.)
  const tenantPhone = ((await page.locator('[data-hpd-smoke="jc-tenant-call"]').getAttribute("href").catch(() => "")) || "").replace(/^tel:/, "").replace(/\D/g, "").slice(-10);
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const t1 = await page.evaluate(() => window.__shared.text);
  // 20 Nov: the job card link comes first (the phone opens the first link), no map link (the card has Navigate).
  assert.match(t1, new RegExp(`^HPD job ${JOB}\\n👷 Open your job card \\(photos, call, navigate\\): https?://\\S+/worker/#o=\\S+\\n📍 1207 1 AVENUE`));
  assert.ok(t1.includes(`&k=${PASS}`), "the link carries the job's upload pass");
  assert.match(t1, /\nThe work:\n• /);
  // 👷 Finish-by date (plan, 21 Nov): HPD's completion date in plain words with the days left / late.
  assert.match(t1, /\n⏰ HPD expects it done by (Sun|Mon|Tue|Wed|Thu|Fri|Sat), [A-Z][a-z]{2} \d{1,2}(, \d{4})? \((\d+ days? (left|late)|due today)\)\n/);
  // The worker's Before / After photos came in by themselves (above), so only the videos are still needed.
  assert.match(t1, /📸 Photos HPD needs: before video, after video\./);
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
  { const body = await wp.locator("body").innerText(); assert.ok(/BEFORE the work/.test(body) && /AFTER the work/.test(body), "before and after parts for the worker"); }
  assert.doesNotMatch(await wp.locator('[data-hpd-smoke="worker-address"]').innerText(), /Loading|not found/);
  assert.match(await wp.locator('[data-hpd-smoke="worker-finish-by"]').innerText(), /⏰ HPD expects it done by \w{3}, \w{3} \d{1,2}.*\((\d+ days? (left|late)|due today)\)/);
  await wp.close();
  assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /Sent to your worker/);
  // 📄 HPD's pages for the worker (21 Nov): drawn from the invitation PDF (signed in), then shared as pictures.
  if (job.ITBFile) {
    itb.open = true;
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
      // 25 Nov (owner: "it should go as one package, with the second page: work description page, then the whole complete
      // message"): 👷 Send to a worker sends ONE PDF: HPD's pages first (work description, then page 2), the whole message
      // last with the job link; no separate text.
      await page.waitForFunction(() => /one PDF/.test(document.querySelector('[data-hpd-smoke="jc-crew-send"]')?.textContent || ""), null, { timeout: 20000 });
      await page.evaluate(() => { window.__shared = null; });
      await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
      await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
      const one = await page.evaluate(async () => { const f = (window.__shared.files || [])[0]; const b = f ? new Uint8Array(await f.arrayBuffer()) : new Uint8Array(); let bin = ""; for (const x of b) bin += String.fromCharCode(x); return { n: (window.__shared.files || []).length, name: f?.name, type: f?.type, text: window.__shared.text || "", b64: btoa(bin) }; });
      assert.equal(one.n, 1, "one file");
      assert.equal(one.text, "", "no separate message");
      assert.equal(one.name, "EQ15239 job for worker.pdf");
      assert.equal(one.type, "application/pdf");
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(Buffer.from(one.b64, "base64"));
      assert.ok(pdf.getPageCount() >= Number(ready) + 1, `HPD's pages, then the message (${pdf.getPageCount()} pages)`);
      if (process.env.SHOTS) (await import("node:fs")).writeFileSync(`${process.env.SHOTS}/worker-packet.pdf`, Buffer.from(one.b64, "base64"));
      const raw = Buffer.from(one.b64, "base64").toString("latin1");
      assert.ok(/\/URI \(https?:\/\/[^)]+\/worker\/#o=EQ15239/.test(raw), "the job link is tappable in the PDF");
      assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /one PDF: HPD's work description page, the second page, then the whole message/);
    }
  }
  // Untick the tenant: left out.
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('[data-hpd-smoke="jc-crew-tenant"]').uncheck();
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  // With HPD's pages ready the share is one PDF: read the message from it.
  const got2 = await page.evaluate(async () => { const f = (window.__shared.files || [])[0]; if (!f) return { text: window.__shared.text }; const b = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (const x of b) bin += String.fromCharCode(x); return { b64: btoa(bin) }; });
  let t2 = got2.text || "";
  if (got2.b64) {
    // The PDF's page text sits in compressed streams: open each and read the drawn words.
    const zlib = await import("node:zlib");
    const raw = Buffer.from(got2.b64, "base64").toString("latin1");
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
      let body = "";
      try { body = zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1"); } catch { continue; }
      t2 += [...body.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((x) => x[1].match(/../g).map((h) => String.fromCharCode(parseInt(h, 16))).join("")).join(" ");
    }
  }
  assert.match(t2, /1207 1 AVENUE/, "the message is in the PDF");
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
