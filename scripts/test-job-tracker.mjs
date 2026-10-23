// 🧭 Job tracker stages (lib/job-tracker.ts): every job lands in exactly one stage from award to payment.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { trackerStage, groupByStage, TRACKER_STAGES } = await loadLib("job-tracker");
const base = { id: "X", outcome: "", arrived: false, appointment: false, tenantStep: "none", approved: false, followState: "open", sentAt: "", paid: 0, outstanding: 0, inPip: false };
const s = (p) => trackerStage({ ...base, ...p });
assert.equal(s({}), "text", "new award: text the tenant");
assert.equal(s({ tenantStep: "waiting" }), "waiting");
assert.equal(s({ tenantStep: "call" }), "book");
assert.equal(s({ tenantStep: "call", appointment: true }), "appointment", "an appointment beats the call reminder");
assert.equal(s({ appointment: true, arrived: true }), "work");
assert.equal(s({ outcome: "APPOINTMENT_REQUESTED", appointment: true }), "appointment", "an appointment outcome isn't finished work");
assert.equal(s({ outcome: "NO_ACCESS_1_WAITING_72H", arrived: true }), "work", "1st no-access try: not paperwork yet");
assert.equal(s({ outcome: "WORK_COMPLETED", arrived: true }), "paperwork");
assert.equal(s({ outcome: "WORK_COMPLETED", approved: true, sentAt: "2026-10-20" }), "sent");
assert.equal(s({ followState: "hpd-closed", sentAt: "2026-10-20" }), "payment");
assert.equal(s({ followState: "sent", sentAt: "2026-10-20", inPip: true, outstanding: 388 }), "payment", "in PIP with money owed");
assert.equal(s({ followState: "done", inPip: true, paid: 1250, outstanding: 0 }), "paid");
assert.equal(s({ followState: "done", inPip: true, paid: 500, outstanding: 300 }), "payment", "partly paid: still waiting");
assert.equal(s({ followState: "hpd-closed", awardAgeDays: 200 }), "closed", "old and not in PIP: no payment record, not 'waiting'");
assert.equal(s({ followState: "hpd-closed", awardAgeDays: 30 }), "payment", "recently closed: waiting for payment");
const g = groupByStage([{ ...base, id: "A" }, { ...base, id: "B", tenantStep: "waiting" }, { ...base, id: "C", followState: "done", inPip: true, paid: 9, outstanding: 0 }]);
assert.deepEqual(Object.keys(g), TRACKER_STAGES.map((x) => x.key));
assert.deepEqual([g.text.length, g.waiting.length, g.paid.length], [1, 1, 1]);
console.log("PASS job tracker: text -> waiting -> book -> appointment -> work -> paperwork -> sent -> payment -> closed (no PIP record) -> paid, each job in one stage");
