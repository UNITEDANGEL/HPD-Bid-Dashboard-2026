// The boxes HPD marked, said plainly (lib/hpd-marks.ts), and the reader's file (the "marks" in public/data/correction_dates.json) has only
// box names: nothing written in the boxes.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const src = fs.readFileSync(new URL("../lib/hpd-marks.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, createRequire(import.meta.url));
const { markedLines, markedFor } = m.exports;
const copy = { omos: ["ER04312"], at: "2026-11-02T10:00:00-05:00", pages: [
  { form: "work affidavit", page: 1, boxes: ["Line 2 date (directed by HPD)", "Work completion date"] },
  { form: "invoice", page: 3, boxes: ["OMO #", "Invoice #", "Invoice date", "Date work started", "Date work completed", "Trade", "Borough", "Building address", "Materials list"] },
  { form: "invoice", page: 4, boxes: [] },
] };
assert.deepEqual(markedLines(copy), [
  "Affidavit: Line 2 date (directed by HPD), Work completion date",
  "Invoice: almost every box (9) — it reached HPD blank. The new copy prints every box.",
]);
assert.deepEqual(markedLines(null), []);
const all = { t1: copy, t2: { omos: ["ER04312"], at: "2026-10-01T00:00:00Z", pages: [] }, t3: { omos: ["ER00460"], pages: [{ form: "no-work affidavit", page: 1, boxes: ["Service charge $"] }] } };
assert.equal(markedFor(all, "t3"), all.t3);
assert.equal(markedFor(all, "nope", "er04312"), copy, "newest for the job");
assert.equal(markedFor(all, "", ""), null);
// The real file: box names only.
const file = new URL("../public/data/correction_dates.json", import.meta.url);
if (fs.existsSync(file)) {
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const allowed = /^(OMO #|RC \/ Mini RC|Trade|Borough( \(line 2\))?|Building address( \(line 2\))?|Work location \/ Apt\.|Tax ID #|Invoice date|Invoice #|Date work (started|completed)|Work permit|Bid amount|Total charge|Signature|Printed name|Title|Quantity|Materials list|Description of work|County|Name of contractor|Line 2 date \(directed by HPD\)|Work (start|completion) date|Service charge \$|Amount \$|Access attempt dates|Tenant phone call dates|Date you arrived at the site|Name of the other contractor|Why it was inaccessible|Reason|Your name \(I, \.\.\.\)|Notary)$/;
  for (const [id, c] of Object.entries(d.marks || {})) {
    assert.deepEqual(Object.keys(c).sort(), ["at", "file", "omos", "pages"], id);
    for (const p of c.pages) for (const b of p.boxes) assert.match(b, allowed, `${id}: only box names`);
  }
}
console.log("PASS HPD's marks: plain lines per page (a blank page said once), the copy found by thread or newest for the job; the file has box names only");
