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
  // 💬 26 Nov: the chat with the worker on the job card.
  const chatLog = [{ at: "2026-11-26T14:00:00.000Z", from: "worker", text: "Need the super's key" }];
  await c.route(/\/api\/drive\/worker-chat-boss$/, async (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    if (b.text) chatLog.push({ at: new Date().toISOString(), from: "boss", text: b.text });
    return r.fulfill({ json: { messages: chatLog } });
  });
  await c.route(/\/api\/drive\/worker-(ticket|list|file|done)/, async (r) => {
    const a = r.request().url().split("/").pop();
    const b = JSON.parse(r.request().postData() || "{}");
    if (a === "worker-ticket") return r.fulfill({ json: { pass: PASS } });
    if (a === "worker-list") return r.fulfill({ json: { files: [{ id: "f0000000001", name: `${JOB} BEFORE photo 1.jpg`, mimeType: "image/jpeg", side: "before", done: pulled.done.includes("f0000000001"), taken: "2026-11-20T15:00:00Z", where: "Kitchen" }, { id: "f0000000002", name: `${JOB} AFTER photo 1.jpg`, mimeType: "image/jpeg", side: "after", done: pulled.done.includes("f0000000002"), taken: "2026-11-22T16:00:00Z" }], folder: "fold00000001" } });
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
  assert.match(rows[1][3], /^EQ15239_KITCHEN.+_BEFORE-WORK-EVIDENCE_PHOTO_20261120\.jpg$/); // 📍 the spot the worker tapped
  assert.match(rows[0][3], /^EQ15239_.+_AFTER-WORK-EVIDENCE_PHOTO_20261122\.jpg$/);
  await page.locator('[data-hpd-smoke="jc-chat-new"]').waitFor({ timeout: 20000 });
  assert.match(await page.locator('[data-hpd-smoke="jc-chat-new"]').innerText(), /1 new from your worker: “Need the super's key”/);
  assert.equal(await page.locator('[data-hpd-smoke="jc-crew-whatsapp"]').count(), 0, "chat instead of the WhatsApp button");
  await page.locator('[data-hpd-smoke="jc-chat-new"]').click();
  await page.locator('[data-hpd-smoke="jc-chat-new"]').waitFor({ state: "detached", timeout: 5000 });
  await page.locator('[data-hpd-smoke="jc-chat-input"]').fill("Jose has it, basement door");
  await page.locator('[data-hpd-smoke="jc-chat-send"]').click();
  await page.locator('[data-hpd-smoke="jc-chat-msg"][data-from="boss"]').waitFor({ timeout: 10000 });
  assert.deepEqual(chatLog.map((m) => m.from), ["worker", "boss"]);
  // 26 Nov (owner: "it didn't save to the job card ... I should be able to see it from anywhere"): the status sits on the card;
  // opening it again doesn't bring them in twice; another phone (nothing saved there yet) brings them in even though Drive
  // already says "on the card".
  const idbRows = (id) => page.evaluate((jid) => new Promise((res) => { const q = indexedDB.open("hpd-field-photos-v1"); q.onsuccess = () => { const t = q.result.transaction("photos").objectStore("photos").getAll(); t.onsuccess = () => res(t.result.filter((x) => x.jobId === jid).length); }; }), id);
  assert.match(await page.locator('[data-hpd-smoke="jc-worker-status"]').innerText(), /From your worker: 1 before \+ 1 after/);
  // 📂 The worker's files are saved in Google Drive by themselves; one tap opens that job's folder.
  assert.equal(await page.locator('[data-hpd-smoke="jc-worker-drive"]').getAttribute("href"), "https://drive.google.com/drive/folders/fold00000001");
  assert.match(await page.locator('[data-hpd-smoke="jc-worker-drive"]').innerText(), /saved in your Google Drive by themselves/);
  // Only the worker's files on the card: no "only on this phone" warning (they are in Drive already).
  const bk = page.locator('[data-hpd-smoke="jc-backup"]');
  if (await bk.count()) assert.doesNotMatch(await bk.innerText(), /These photos are only on this phone/);
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => /All 2 from your worker are on this job card/.test(document.querySelector('[data-hpd-smoke="jc-worker-status"]')?.textContent || ""), null, { timeout: 30000 });
  assert.equal(await idbRows(JOB), 2, "opened again: not brought in twice");
  await page.evaluate((jid) => new Promise((res) => { localStorage.removeItem(`hpd-worker-got-${jid}`); const q = indexedDB.open("hpd-field-photos-v1"); q.onsuccess = () => { const st = q.result.transaction("photos", "readwrite").objectStore("photos"); const g = st.getAll(); g.onsuccess = () => { for (const x of g.result.filter((y) => y.jobId === jid)) st.delete(x.id); st.transaction.oncomplete = () => res(); }; }; }), JOB);
  await page.goto(`${baseUrl}/map/?omo=${JOB}&view=all`, { waitUntil: "load", timeout: 180000 });
  await page.locator("#fc-job-card").waitFor({ timeout: 60000 });
  await page.waitForFunction(() => /From your worker: 1 before \+ 1 after/.test(document.querySelector('[data-hpd-smoke="jc-worker-status"]')?.textContent || ""), null, { timeout: 30000 });
  assert.equal(await idbRows(JOB), 2, "another phone: brought in there too");
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
      // 25 Nov, later (owner: "send the details like before with the navigation link and everything, but just send the pdf
      // separate"): the job details as the message (job card link, 🧭 Navigate, the work, the super, the tenant) + HPD's pages
      // as one PDF next to it.
      await page.waitForFunction(() => /details \+ HPD's PDF/.test(document.querySelector('[data-hpd-smoke="jc-crew-send"]')?.textContent || ""), null, { timeout: 20000 });
      await page.evaluate(() => { window.__shared = null; });
      await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
      await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
      const one = await page.evaluate(async () => { const f = (window.__shared.files || [])[0]; const b = f ? new Uint8Array(await f.arrayBuffer()) : new Uint8Array(); let bin = ""; for (const x of b) bin += String.fromCharCode(x); return { n: (window.__shared.files || []).length, name: f?.name, type: f?.type, text: window.__shared.text || "", b64: btoa(bin) }; });
      assert.equal(one.n, 1, "one PDF");
      assert.equal(one.name, "EQ15239 HPD work description.pdf");
      assert.equal(one.type, "application/pdf");
      assert.match(one.text, /^HPD job EQ15239\n👷 Open your job card \(photos, call, navigate\): https?:\/\/\S+\/worker\/#o=EQ15239&k=/);
      assert.match(one.text, /\n🧭 Navigate: https:\/\/www\.google\.com\/maps\//);
      assert.match(one.text, /They go straight to the boss's job card, labeled\. No WhatsApp needed\./);
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.load(Buffer.from(one.b64, "base64"));
      assert.equal(pdf.getPageCount(), Number(ready), "HPD's pages only");
      if (process.env.SHOTS) (await import("node:fs")).writeFileSync(`${process.env.SHOTS}/worker-packet.pdf`, Buffer.from(one.b64, "base64"));
      assert.match(await page.locator('[data-hpd-smoke="jc-crew-msg"]').innerText(), /the job details \(job card link, navigation, the work, the super, the tenant\) \+ HPD's PDF/);
    }
  }
  // Untick the tenant: left out.
  await page.evaluate(() => { window.__shared = null; });
  await page.locator('[data-hpd-smoke="jc-crew-tenant"]').uncheck();
  await page.locator('[data-hpd-smoke="jc-crew-send"]').click();
  await page.waitForFunction(() => window.__shared, null, { timeout: 5000 });
  const t2 = await page.evaluate(() => window.__shared.text || "");
  assert.match(t2, /1207 1 AVENUE/, "the details go as the message");
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
