// The emailed copy of a corrected paperwork (lib/correction-copy.ts): same pages, "COPY" on every page, a yellow box on
// page 1 saying what HPD rejected and what changed (old -> new); text HPD's font can't print is cleaned, not crashed on.
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { loadLib } from "./daily-report.mjs";

const { markCorrectedCopy } = await loadLib("correction-copy");
const src = await PDFDocument.create();
src.addPage([612, 792]);
src.addPage([612, 792]);
const original = await src.save();
const out = await markCorrectedCopy(original, {
  omo: "EP19269", rejectedAt: "2026-09-25", reason: "Address is spelled incorrectly on Invoice and affidavit. 133 Seaman Ave MH “THANK YOU” — Invoice",
  changes: [{ label: "Address", from: "133 SEAMEN AVENUE", to: "133 SEAMAN AVENUE" }, { label: "Borough", from: "", to: "MANHATTAN" }],
  fixedOn: "10/17/2026",
});
const doc = await PDFDocument.load(out);
assert.equal(doc.getPageCount(), 3, "a cover page + the same pages");
// The drawn text sits in compressed page streams: open them all.
function inflateAll(bytes) {
  const b = Buffer.from(bytes);
  const s = b.toString("latin1");
  let all = s;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    try { all += zlib.inflateSync(b.subarray(start, end)).toString("latin1"); } catch { /* not compressed */ }
  }
  return all;
}
const raw = inflateAll(out);
const hex = (t) => Buffer.from(t, "latin1").toString("hex").toUpperCase();
assert.ok(raw.includes(hex("COPY - CORRECTED PAPERWORK")) && raw.includes(hex("OMO# EP19269")), "the cover page names the OMO");
assert.ok(raw.includes(hex("Address: 133 SEAMEN AVENUE -> 133 SEAMAN AVENUE")), "old -> new");
assert.ok(raw.includes(hex("Borough: (blank) -> MANHATTAN")));
assert.equal(raw.split(hex("COPY - CORRECTED PAPERWORK (original signed in ink, sent by mail)")).length - 1, 2, "COPY on every page");
assert.ok(out.byteLength > original.byteLength);
// No changes known: still says it was corrected.
const none = inflateAll(await markCorrectedCopy(original, { omo: "EQ17038", rejectedAt: "", reason: "", changes: [], fixedOn: "10/17/2026" }));
assert.ok(none.includes(hex("Corrected as HPD asked (see the notice).")));
console.log("PASS correction copy: COPY on every page, cover page with HPD's reason and each change (old -> new), odd characters cleaned");
