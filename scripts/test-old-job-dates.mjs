// Old-job date check (20 Oct, after EP27382): asks when the work date is more than 60 days after the award, offers HPD's
// start / complete-by dates when they fit; a confirmation only covers the same dates.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { oldJobDateCheck, readDay, showDay } = await loadLib("old-job-dates");
assert.equal(showDay(readDay("5/28/25")), "05/28/2025");
assert.equal(showDay(readDay("2025-05-28T14:00:00Z")), "05/28/2025");
// EP27382: awarded 5/21/2025, paperwork said 10/20/2026.
const c = oldJobDateCheck({ omo: "EP27382", award: "2025-05-21", start: "10/20/2026", complete: "10/20/2026" });
assert.ok(c);
assert.equal(c.text, "This job was awarded 05/21/2025, but the work date says 10/20/2026 (17 months later). Was the work really done then?");
assert.equal(c.suggest, null, "no HPD dates known");
// HPD's dates offered when they fit; a recent job / a job done in time never asks.
const d = oldJobDateCheck({ omo: "EQ15489", award: "01/05/26", start: "10/20/2026", complete: "10/20/2026", hpdStart: "1/5/26", hpdComplete: "1/15/26" });
assert.deepEqual(d.suggest, { start: "01/05/2026", complete: "01/15/2026" });
assert.equal(oldJobDateCheck({ omo: "EQ15489", award: "01/05/26", start: "01/06/2026", complete: "01/15/2026" }), null);
assert.equal(oldJobDateCheck({ omo: "X", award: "", complete: "10/20/2026" }), null, "no award date: nothing to compare");
assert.equal(oldJobDateCheck({ omo: "X", award: "2026-08-25", complete: "2026-10-20" }), null, "56 days: fine");
// The "these dates are right" answer is tied to the dates.
assert.notEqual(oldJobDateCheck({ omo: "EP27382", award: "2025-05-21", complete: "10/21/2026" }).key, c.key);
console.log("PASS old-job dates: EP27382 (05/21/2025 -> 10/20/2026, 17 months) asks; HPD's dates offered when they fit; jobs done in time / no award date never ask; a yes only covers those dates");
