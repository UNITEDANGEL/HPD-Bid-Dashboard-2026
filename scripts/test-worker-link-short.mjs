// 👷 The worker link stays short enough for WhatsApp (owner, 20 Nov: the link opened from WhatsApp showed an empty Worker
// page): for the longest real HPD description, the link is about 100 letters (job number + tenant / super only), opens back whole, and a cut link is caught.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadLib } from "./daily-report.mjs";

const { workerLink, readWorkerHash, workerHashCut } = await loadLib("worker-link");
const { workFull, workWhere } = await loadLib("crew-share");
const data = JSON.parse(readFileSync("public/data/COA_Fetcher_2026.json", "utf8"));
const rows = Array.isArray(data) ? data : data.jobs || [];
const desc = (j) => String(j.ItbPage3Description || j.JobDescription || "");
const worst = rows.reduce((a, b) => (desc(b).length > desc(a).length ? b : a));
const lines = desc(worst).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 10);
const crew = { id: worst.OMO, address: String(worst.Address || "1 MAIN STREET, BROOKLYN, 11201"), apt: "12C", completeBy: "12/01/2026", work: lines, contact: { name: "Super", phone: "(212) 555-0147", note: "basement door" }, tenant: { name: "Tenant Name", phone: "(718) 555-0100" }, photos: [{ label: "Before photos", done: false }, { label: "After photos", done: false }], where: workWhere(desc(worst), "12C"), full: workFull(desc(worst)) };
const link = workerLink("https://hpd-bid-dashboard-2026.pages.dev", crew);
assert.ok(link.length < 200, `link is ${link.length} letters: ${link}`);
assert.ok(link.endsWith(`/worker/#o=${worst.OMO}&a=12C&t=Tenant&p=7185550100&s=Super&sp=2125550147&sn=basement+door`), link);
const hash = link.slice(link.indexOf("#"));
const back = readWorkerHash(hash);
assert.equal(back.id, worst.OMO);
assert.equal(back.address, "", "the page reads the address from the public job list");
assert.equal(back.tenant.phone, "7185550100");
assert.equal(back.tenant.name, "Tenant");
assert.equal(back.contact.note, "basement door");
assert.deepEqual(back.photos, ["Before photos", "After photos"]);
assert.equal(workerHashCut(hash), false);
assert.equal(workerHashCut("#o=ER0"), true, "a cut link is caught");
assert.equal(workerHashCut("#j=eyJpZCI6"), true, "a cut old link is caught");
assert.equal(workerHashCut(""), false);
console.log(`PASS worker link short: ${worst.OMO} (${desc(worst).length}-letter description) -> ${link.length}-letter link (${link.slice(link.indexOf('/worker'))}); cut link caught`);
