// 📋 Friday late list: open jobs due by next Friday (and already late), soonest first; closed / sent / test jobs left out.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { lateNextWeek, lateWeekLine, isLateWeekTime } = await loadLib("late-week");
const jobs = [
  { OMO: "ER00001", WorkCompletionDate: "11/27/26" },                                   // next Friday: in
  { OMO: "ER00002", WorkCompletionDate: "2026-11-18" },                                 // already late: in, first
  { OMO: "ER00003", WorkCompletionDate: "11/28/26" },                                   // after next Friday: out
  { OMO: "ER00004", WorkCompletionDate: "11/23/26", FieldOutcome: "WORK_COMPLETED" },   // closed: out
  { OMO: "ER00005", WorkCompletionDate: "11/23/26", PaperworkSentAt: "2026-11-19" },    // paperwork sent: out
  { OMO: "TEST-1", WorkCompletionDate: "11/23/26" },                                    // test job: out
  { OMO: "ER00006" },                                                                   // no date: out
  { OMO: "ER00007", WorkCompletionDate: "11/20/26" },                                   // due today
  { OMO: "ER00008", WorkCompletionDate: "11/24/26", FieldOutcome: "PARTIAL_WORK_COMPLETED" }, // partial counts as closing in the field: out
];
const list = lateNextWeek(jobs, "2026-11-20"); // a Friday
assert.deepEqual(list.map((x) => x.id), ["ER00002", "ER00007", "ER00001"]);
assert.deepEqual(list.map((x) => x.days), [-2, 0, 7]);
assert.equal(lateWeekLine(list), "📋 Late list: 3 open jobs are due by next Friday (1 already late): ER00002 (late since 11/18), ER00007 (due today) and ER00001 (due 11/27). Plan next week's route.");
assert.equal(lateWeekLine([]), "");
assert.equal(lateWeekLine([{ id: "ER9", due: "2026-11-23", days: 3 }]), "📋 Late list: 1 open job is due by next Friday: ER9 (due 11/23). Plan next week's route.");
const many = Array.from({ length: 6 }, (_, i) => ({ id: `ER${i}`, due: "2026-11-24", days: 4 }));
assert.match(lateWeekLine(many), /, and 2 more\. Plan/);
// Monday: through the Friday of next week (11 days on).
assert.deepEqual(lateNextWeek([{ OMO: "A", WorkCompletionDate: "11/27/26" }, { OMO: "B", WorkCompletionDate: "11/28/26" }], "2026-11-16").map((x) => x.id), ["A"]);
assert.deepEqual(lateNextWeek(jobs, "bad"), []);
assert.equal(isLateWeekTime(5, 13 * 60), true);
assert.equal(isLateWeekTime(5, 12 * 60 + 59), false);
assert.equal(isLateWeekTime(4, 15 * 60), false);
assert.equal(isLateWeekTime(5, 16 * 60 + 59), true);
assert.equal(isLateWeekTime(5, 17 * 60), false); // 5 PM: the Friday wrap
console.log("PASS Friday late list: due by next Friday, already late first, closed / sent / test / no date left out, Friday 1-5 PM");
