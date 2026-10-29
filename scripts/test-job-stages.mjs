// One status line per job: Awarded -> Tenant -> Work done -> Paperwork sent -> HPD closed -> Paid.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { jobStages, nextStep } = await loadLib("job-stages");
const tones = (st) => st.map((x) => `${x.key}:${x.tone}`).join(" ");

// Just awarded.
let st = jobStages({ OMO: "A1", AwardDate: "10/01/26", WorkCompletionDate: "10/10/26" });
assert.equal(tones(st), "awarded:done tenant:todo work:todo paperwork:todo closed:todo paid:todo");
assert.equal(nextStep(st), "Call the tenant first (or text) for a day and time.");
// Calls count (29 Oct): no answer -> call again; talked -> book a time; a public-area job has no tenant step.
st = jobStages({ OMO: "C1", AwardDate: "10/01/26", TenantCalledAt: "2026-10-02T14:00:00Z", TenantCallResult: "no-answer" });
assert.equal(st[1].label, "Tenant called");
assert.equal(nextStep(st), "Call the tenant again (or text them).");
st = jobStages({ OMO: "C2", AwardDate: "10/01/26", TenantCalledAt: "2026-10-02T14:00:00Z", TenantCallResult: "talked" });
assert.equal(nextStep(st), "Call the tenant and set the appointment.");
st = jobStages({ OMO: "C3", AwardDate: "10/01/26", ItbTenantAccessType: "Common Area" });
assert.equal(st[1].tone, "done");
assert.equal(st[1].label, "Public area");
// The tenant: texted -> replied -> appointment (23 Oct).
st = jobStages({ OMO: "T1", AwardDate: "10/01/26", TenantTextedAt: "2026-10-02T14:00:00Z" });
assert.equal(st[1].label, "Tenant texted");
assert.equal(nextStep(st), "Waiting for the tenant to answer (call after a day).");
st = jobStages({ OMO: "T2", AwardDate: "10/01/26", TenantTextedAt: "2026-10-02T14:00:00Z", TenantRepliedAt: "2026-10-03T14:00:00Z" });
assert.equal(nextStep(st), "Call the tenant and set the appointment.");
st = jobStages({ OMO: "T3", AwardDate: "10/01/26", Appointment: { date: "2026-10-29", start: "10:00", state: "requested" } });
assert.equal(tones(st), "awarded:done tenant:done work:todo paperwork:todo closed:todo paid:todo");
assert.equal(st[1].detail, "10/29/26 10:00");
assert.equal(nextStep(st), "Do the work (or record the visit).");
// Work done, paperwork not sent: that's the next thing.
st = jobStages({ OMO: "A2", AwardDate: "10/01/26", FieldOutcome: "WORK_COMPLETED", ActualWorkCompletionDate: "2026-10-05" });
assert.equal(tones(st), "awarded:done tenant:done work:done paperwork:now closed:todo paid:todo");
assert.equal(st[2].detail, "10/5/26");
assert.equal(nextStep(st), "Send the paperwork to HPD.");
// Sent, HPD closed, PIP paid: all done.
st = jobStages({ OMO: "A3", AwardDate: "09/01/26", FieldOutcome: "WORK_COMPLETED", PackageEmailedAt: "2026-09-10T15:00:00Z", HpdClosedReason: "OMO Completed" }, { status: "paid", paid: 450, outstanding: 0, closed: true });
assert.equal(tones(st), "awarded:done tenant:done work:done paperwork:done closed:done paid:done");
assert.equal(nextStep(st), "All done: paid.");
// HPD rejected the paperwork (not paid): red until fixed.
st = jobStages({ OMO: "A4", AwardDate: "09/01/26", HpdClosedReason: "OMO Completed", PaperworkSentAt: "2026-09-10" }, { status: "not paid yet", paid: 0, outstanding: 390, closed: false }, { at: "2026-09-21", reason: "invoice is missing vendor signature", answered: false, pay: "payable" });
assert.equal(st[3].tone, "bad");
assert.match(st[3].detail, /9\/21\/26: invoice is missing vendor signature/);
assert.equal(nextStep(st), "Fix and resend the rejected paperwork.");
// HPD closed it with nothing paid.
st = jobStages({ OMO: "A5", AwardDate: "07/11/23", HpdClosedReason: "OMO Completed", PaperworkSentAt: "2023-08-01" }, { status: "not paid yet", paid: 0, outstanding: 0, closed: true });
assert.equal(st[5].tone, "bad");
assert.equal(nextStep(st), "HPD closed it with $0 paid: dispute it with HPD.");
// No app record but HPD closed it as No Access: the work step counts as done.
st = jobStages({ OMO: "A6", AwardDate: "05/01/26", HpdClosedReason: "No Access" });
assert.equal(st[2].tone, "done");
// Outcome recorded months after the paperwork went out: shown as "recorded", not as the work date.
st = jobStages({ OMO: "A7", AwardDate: "01/05/26", FieldOutcome: "COMPLETED_BY_OTHERS", VerifiedByOthersDate: "2026-06-23T12:43:00.000Z", PaperworkSentAt: "2026-02-19" });
assert.equal(st[2].detail, "recorded 6/23/26");
console.log("PASS job stages: awarded -> tenant (texted / replied / appointment) -> work done -> paperwork sent / rejected -> HPD closed -> paid (PIP), and the next step");
