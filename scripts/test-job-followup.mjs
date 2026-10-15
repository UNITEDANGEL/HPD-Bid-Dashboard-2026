// Job follow-up: status from the app first, then HPD's closing reason / paperwork sent; maturity dates,
// overdue and due-this-week; the daily follow-up report.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { followUpOf, followUpReport, recoveredStatus, paperworkRejections } = await loadLib("job-followup");
const { jobQueue } = await loadLib("job-queue");
const today = "2026-10-13";
const job = (omo, award, start, finish, extra = {}) => ({ OMO: omo, BuildingAddress: `${omo} MAIN ST`, AwardDate: award, WorkStartDate: start, WorkCompletionDate: finish, ...extra });

// The app's own status wins.
const done = followUpOf(job("A1", "09/01/26", "09/03/26", "09/10/26", { FieldOutcome: "WORK_COMPLETED" }), { closedReason: "No Access" }, undefined, today);
assert.equal(done.state, "done");
// No app status, HPD closed it: closed, no overdue count.
const hpd = followUpOf(job("A2", "09/01/26", "09/03/26", "09/10/26"), { closedReason: "No Access" }, { sentAt: "2026-09-12", count: 1 }, today);
assert.deepEqual([hpd.state, hpd.status, hpd.sentAt], ["hpd-closed", "No access (HPD closed)", "2026-09-12"]);
assert.equal(recoveredStatus(job("x"), { closedReason: "OMO Completed" }).kind, "complete");
assert.equal(recoveredStatus(job("x"), { closedReason: "Owner Refused Access" }).kind, "refused");
assert.equal(recoveredStatus(job("x"), { closedReason: "Landlord Complied" }).kind, "others");
// Paperwork sent, HPD still open: waiting on HPD, not overdue work.
const sent = followUpOf(job("A3", "09/01/26", "09/03/26", "09/10/26"), { closedReason: "" }, { sentAt: "2026-09-12", count: 1 }, today);
assert.equal(sent.state, "sent");
// Nothing anywhere, past the completion date: overdue by the right number of days.
const late = followUpOf(job("A4", "09/01/26", "09/03/26", "09/10/26"), { closedReason: "" }, undefined, today);
assert.deepEqual([late.state, late.daysLeft, late.awardDay, late.maturityDay], ["overdue", -33, "2026-09-01", "2026-09-10"]);
const soon = followUpOf(job("A5", "10/07/26", "10/09/26", "10/16/26"), undefined, undefined, today);
assert.deepEqual([soon.state, soon.daysLeft], ["due-week", 3]);
const later = followUpOf(job("A6", "10/10/26", "10/12/26", "10/30/26"), undefined, undefined, today);
assert.equal(later.state, "open");

const report = followUpReport([
  job("A1", "09/01/26", "09/03/26", "09/10/26", { FieldOutcome: "WORK_COMPLETED" }),
  job("A2", "09/01/26", "09/03/26", "09/10/26"),
  job("A3", "09/01/26", "09/03/26", "09/10/26"),
  job("A4", "08/01/26", "08/03/26", "08/10/26"),
  job("A7", "09/20/26", "09/22/26", "09/30/26"),
  job("A5", "10/07/26", "10/09/26", "10/16/26"),
  job("TEST-0001", "10/01/26", "10/01/26", "10/02/26"),
], { A2: { closedReason: "No Access" }, A3: { closedReason: "" } }, { A2: { sentAt: "2026-09-12", count: 1 }, A3: { sentAt: "2026-09-12", count: 1 } }, today,
  // HPD staff asked about A4 (nothing sent: open request), A3 before its paperwork went out (answered), A2 (closed).
  { A4: { askedAt: "2026-10-01", count: 2 }, A3: { askedAt: "2026-09-10", count: 1 }, A2: { askedAt: "2026-10-01", count: 1 } });
assert.deepEqual(report.counts, { hpdAsked: 1, total: 6, done: 1, hpdClosed: 1, waitingOnHpd: 1, overdue: 2, dueWeek: 1, recent: 2 }, "the test job is left out");
assert.deepEqual(report.overdue.map((r) => r.omo), ["A7", "A4"], "most recently overdue first, the oldest at the bottom");
assert.deepEqual(report.hpdAsked.map((r) => [r.omo, r.askedAt]), [["A4", "2026-10-01"]], "HPD asked and nothing sent since; answered and closed requests drop off");
assert.deepEqual(report.recent.map((r) => r.omo), ["A5", "A7"], "awarded in the last 30 days, newest first");

// Rejected payment paperwork: waiting on you until you email HPD after the rejection; older jobs too.
const rej = paperworkRejections({
  EO34807: { askedAt: "2026-05-07", count: 1, rejectedTs: Date.parse("2026-05-07T15:00:00Z"), rejectedAt: "2026-05-07", rejectedBy: "B. Basdeo", rejectedReason: "Dates on Invoice does not match affidavit" },
  A2: { askedAt: "2026-10-01", count: 1, rejectedTs: Date.parse("2026-10-01T15:00:00Z"), rejectedAt: "2026-10-01", rejectedBy: "HPD", rejectedReason: "deemed unacceptable", repliedTs: Date.parse("2026-10-02T15:00:00Z") },
  A3: { askedAt: "2026-10-01", count: 2 },
}, [job("A2", "09/01/26", "09/03/26", "09/10/26")]);
assert.deepEqual(rej.map((r) => [r.omo, r.answered, r.onMap]), [["EO34807", false, false], ["A2", true, true]], "open first; an older job not on the map is listed; requests without a rejection are not");
assert.equal(rej[0].reason, "Dates on Invoice does not match affidavit");
// PIP: paid after all -> done; still open -> fix now (first); closed with nothing paid -> lost.
const withPip = paperworkRejections({
  P1: { askedAt: "2026-09-01", count: 1, rejectedTs: 1, rejectedAt: "2026-09-01" },
  P2: { askedAt: "2026-09-02", count: 1, rejectedTs: 2, rejectedAt: "2026-09-02" },
  P3: { askedAt: "2026-09-03", count: 1, rejectedTs: 3, rejectedAt: "2026-09-03" },
}, [], { P1: { status: "paid", paid: 500, outstanding: 0, closed: true }, P2: { status: "not paid yet", paid: 0, outstanding: 390, closed: false }, P3: { status: "not paid yet", paid: 0, outstanding: 0, closed: true } });
assert.deepEqual(withPip.map((r) => [r.omo, r.pay, r.answered]), [["P2", "payable", false], ["P3", "lost", false], ["P1", "paid", true]]);

// Map queues: HPD closed -> Completed; paperwork sent, HPD open -> Follow-up; nothing -> Pending.
assert.equal(jobQueue({ OMO: "Q1", HpdClosedReason: "No Access" }), "completed");
assert.equal(jobQueue({ OMO: "Q2", PaperworkSentAt: "2026-09-12" }), "followup");
assert.equal(jobQueue({ OMO: "Q3" }), "pending");
assert.equal(jobQueue({ OMO: "Q4", FieldOutcome: "NO_ACCESS_1_WAITING_72H", HpdClosedReason: "No Access" }), "followup", "the app's own status comes first");

console.log("PASS job follow-up: app status first, then HPD's closing reason / paperwork sent; overdue, due this week, awarded last 30 days; queues");
