// 🔁 Monday paperwork sweep (plan item 32).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { paperworkLeft, mondaySweepLine, isMondaySweepTime } = await loadLib("monday-sweep");
const jobs = [
  { OMO: "ER00003", FieldOutcome: "WORK_COMPLETED", OutcomeLockedAt: "2026-11-04T15:00:00Z" },
  { OMO: "ER00001", FieldOutcome: "NO_ACCESS_2", OutcomeLockedAt: "2026-10-30T15:00:00Z" },
  { OMO: "ER00002", FieldOutcome: "WORK_COMPLETED", OutcomeLockedAt: "2026-11-01T15:00:00Z", PaperworkSentAt: "2026-11-02" },
  { OMO: "ER00004", FieldOutcome: "WORK_STARTED" },
  { OMO: "ER00005", FieldOutcome: "PARTIAL_WORK", OutcomeLockedAt: "2026-11-02T15:00:00Z" },
  { OMO: "TEST-0001", FieldOutcome: "WORK_COMPLETED" },
  { OMO: "ER00006", FieldOutcome: "REFUSED_ACCESS", OutcomeLockedAt: "2026-11-03T15:00:00Z" },
];
const left = paperworkLeft(jobs, { ER00006: { sentAt: "2026-11-04" } });
assert.deepEqual(left.map((x) => x.id), ["ER00001", "ER00005", "ER00003"], "finished, not sent, oldest first");
assert.equal(mondaySweepLine(left), "Monday sweep: 3 finished jobs still need the paperwork sent, oldest first: ER00001, ER00005 and ER00003.");
assert.equal(mondaySweepLine([{ id: "ER1" }]), "Monday sweep: 1 finished job still needs the paperwork sent, oldest first: ER1.");
assert.equal(mondaySweepLine([]), "");
assert.equal(isMondaySweepTime(1, 8), true);
assert.equal(isMondaySweepTime(1, 7), false);
assert.equal(isMondaySweepTime(2, 9), false);
console.log("PASS Monday sweep: finished jobs with paperwork not sent, oldest first, Monday from 8 AM");
