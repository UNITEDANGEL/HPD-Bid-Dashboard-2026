// 🔧 Rejected job fixer: what to redo, and which jobs need a visit.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { rejectedFixes, whatToRedo } = await loadLib("rejected-fixer");
assert.deepEqual(whatToRedo("1. Same area on both documents. 2. Dates do not match."), ["Same area on both documents.", "Dates do not match."]);
assert.equal(whatToRedo("")[0], "Read HPD's rejection note");
const now = new Date("2026-11-14T12:00:00Z"), ts = (d) => new Date(d).getTime();
const asked = {
  er1: { rejectedTs: ts("2026-11-10"), rejectedAt: "2026-11-10", rejectedReason: "1. Please send new photos. 2. Dates off." },
  er2: { rejectedTs: ts("2026-11-10"), rejectedAt: "2026-11-10", rejectedReason: "Dates do not match." },
  er3: { rejectedTs: ts("2026-11-10"), rejectedAt: "2026-11-10", rejectedReason: "photos", repliedTs: ts("2026-11-11") },
  er4: { rejectedTs: ts("2026-08-01"), rejectedAt: "2026-08-01", rejectedReason: "photos" },
  er5: { rejectedTs: ts("2026-11-10"), rejectedAt: "2026-11-10", rejectedReason: "photos" },
};
const f = rejectedFixes(asked, { ER5: "2026-11-12" }, now);
assert.deepEqual(Object.keys(f).sort(), ["ER1", "ER2"]);
assert.equal(f.ER1.needsVisit, true); assert.equal(f.ER2.needsVisit, false);
assert.equal(f.ER1.todo.length, 2);
console.log("rejected-fixer ok");
