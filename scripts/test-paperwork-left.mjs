import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const src = ts.transpileModule(fs.readFileSync(new URL("../lib/paperwork-left.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("exports", "module", src)(mod.exports, mod);
const { paperworkLeft } = mod.exports;
const base = { id: "OMO1", outcome: "WORK_COMPLETED", before: 2, after: 0, approved: false, invoiceDone: false, paperworkHref: "/paperwork?job=OMO1" };

let r = paperworkLeft(base);
assert.equal(r.left, 3);
assert.equal(r.next.key, "photos");
assert.match(r.items[0].detail, /Missing after/);

r = paperworkLeft({ ...base, after: 3 });
assert.equal(r.left, 2);
assert.equal(r.next.key, "affidavit");
assert.equal(r.next.href, "/paperwork?job=OMO1");

r = paperworkLeft({ ...base, after: 3, approved: true });
assert.equal(r.next.key, "invoice");
assert.match(r.next.href, /^\/invoice-generator\?job=OMO1&outcome=WORK_COMPLETED$/);

r = paperworkLeft({ ...base, after: 3, approved: true, invoiceDone: true });
assert.equal(r.allDone, true);
assert.equal(r.next, null);

// No-work outcomes only need the affidavit.
r = paperworkLeft({ ...base, outcome: "REFUSED_ACCESS", before: 0 });
assert.deepEqual(r.items.map((i) => i.key), ["affidavit"]);

// No outcome yet / appointment: nothing to list.
assert.equal(paperworkLeft({ ...base, outcome: "" }), null);
assert.equal(paperworkLeft({ ...base, outcome: "APPOINTMENT_REQUESTED" }), null);
console.log("paperwork-left tests passed");
