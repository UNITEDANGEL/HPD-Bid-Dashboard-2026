// 🔎 Check every notice (owner, 5 Nov: "ER01720 is already sent ... it's still coming up ... we cannot make mistakes
// like this"). A notice answered with the PDF in ANOTHER email (here: the stop work notice thread) is already sent; the
// job card doesn't ask to call the tenant or visit again.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildBoard } = await loadLib("notice-board");
const { checkNotices } = await loadLib("notice-check");
const { jobStages, nextStep } = await loadLib("job-stages");
const { visitState } = await loadLib("job-queue");

const now = Date.parse("2026-11-05T17:00:00-05:00");
const threads = [
  { id: "t1", subject: "72 HR POOR PERFORMANCE NOTICE- OMO#ER01720", omos: ["ER01720"], people: ["J. Lewis"], messages: [
    { at: "2026-10-22T15:39:44-04:00", hpd: true, mine: false, text: "Kindly see attached 72 HR POOR PERFORMANCE NOTICE for OMO#ER01720.", files: ["72 HR PPN- ER01720.pdf"] }] },
  { id: "t2", subject: "OMO#ER01720- STOP WORK NOTICE", omos: ["ER01720"], people: ["J. Lewis"], messages: [
    { at: "2026-10-29T16:39:36-04:00", hpd: true, mine: false, text: "Please see attached STOP WORK NOTICE Re: OMO#ER01720", files: ["OMO#ER01720 STOP WORK NOTICE.pdf"] },
    { at: "2026-10-30T09:30:19-04:00", hpd: false, mine: true, text: "Please see the attached refused access affidavit and invoice.", files: ["ER01720 AFF INVOICE.pdf"] }] },
  { id: "t3", subject: "24 HR POOR PERFORMANCE NOTICE- OMO#ER09999", omos: ["ER09999"], people: ["J. Lewis"], messages: [
    { at: "2026-11-05T09:00:00-05:00", hpd: true, mine: false, text: "Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#ER09999.", files: [] }] },
];
const rows = buildBoard({ threads, sent: { ER01720: { sentAt: "2026-10-30" } }, marks: {}, now });
const c = checkNotices(rows, threads, now);
assert.equal(c.items.length, 2);
assert.match(c.summary, /Checked 2 notices from your email: 1 already sent, 1 to send/);
const a = c.items.find((x) => x.omo === "ER01720");
assert.equal(a.tone, "sent");
assert.match(a.head, /Already sent 10\/30: ER01720 AFF INVOICE\.pdf\. Don't send it again/);
assert.ok(a.lines.some((l) => /STOP WORK NOTICE 10\/29/.test(l)), "the stop work notice is named");
assert.ok(a.lines.some((l) => /in your email "OMO#ER01720- STOP WORK NOTICE"/.test(l)), "where it was sent");
const b = c.items.find((x) => x.omo === "ER09999");
assert.equal(b.tone, "tosend");
assert.equal(c.items[0].omo, "ER09999", "to send comes first");

// The job card: papers sent by email, no visit recorded in the app -> waiting on HPD, not "call the tenant".
const job = { OMO: "ER01720", AwardDate: "07/28/26", WorkCompletionDate: "8/10/26", PaperworkSentAt: "2026-10-30" };
const st = jobStages(job);
assert.equal(st.map((x) => `${x.key}:${x.tone}`).join(" "), "awarded:done tenant:done work:done paperwork:done closed:now paid:todo");
assert.equal(nextStep(st), "Waiting for HPD to close it.");
assert.equal(visitState(job).label, "Papers sent: no visit needed");
assert.equal(visitState({ OMO: "X1" }).label, "Needs visit", "no papers: still needs a visit");
console.log("PASS check every notice: ER01720 (PDF sent in the stop work email) = already sent, don't send again; job card waits on HPD, no tenant call or visit");
