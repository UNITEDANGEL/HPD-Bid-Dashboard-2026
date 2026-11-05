// 🗂 ✅ (owner, 5 Nov: "AI should go through all the notices, find related emails and see if the affidavit and invoice
// has been sent"; "ER00272 I already answered, it's still on the board"; "a button that says I already fixed it";
// "ER01720 I sent the paperwork, it says overdue"). The board reads HPD's answer after our PDF in any email about the
// job, takes the owner's "already sent / fixed", a correction saved in the app, and the words that drive it.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildBoard, boardSide, hpdAnswerAfter, hpdWords } = await loadLib("notice-board");
const { parseCommand } = await loadLib("voice-agent");
const { walkNext, walkClock } = await loadLib("../app/field-command/NoticeWalk").catch(() => ({}));

const now = Date.parse("2026-11-05T15:00:00Z");
const hpd = (at, text) => ({ at, text, hpd: true, mine: false });
const mine = (at, files = [], text = "Please find attached.") => ({ at, text, hpd: false, mine: true, files });
const ppn = (id, omo, at) => ({ id, subject: `24 HR POOR PERFORMANCE NOTICE- OMO#${omo}`, omos: [omo], people: ["Joy-Ann Lewis"], messages: [hpd(at, "Kindly see attached 24 HR POOR PERFORMANCE NOTICE. LewisJ@hpd.nyc.gov")] });
const side = (id, subject, omo, messages) => ({ id, subject, omos: [omo], people: ["Joy-Ann Lewis"], messages });

// ER00272's real story: the notice, the PDF in another thread, "the copy is blank", our promise, "Noted".
const threads = [
  ppn("p1", "ER00272", "2026-10-22T19:44:00Z"),
  side("c1", "INVOICE IS INCOMPLETE- OMO#ER00272", "ER00272", [
    hpd("2026-10-26T15:38:00Z", "Good morning Jot, Kindly see attached invoice with highlighted errors. Please fill in all highlighted areas and resubmit"),
    mine("2026-10-26T17:10:00Z", ["ER00272 AFF INVOICE.pdf"]),
    hpd("2026-10-26T18:19:00Z", "Hi Jot,\n\nPlease note the copy you just resubmitted is blank.\n\nRegards,\n\nJoy-Ann Lewis| Community Associate"),
    mine("2026-10-27T16:05:00Z", [], "I will re-send the corrected documents shortly."),
    hpd("2026-10-27T16:23:00Z", "Good afternoon Jot,\n\nNoted with thanks.\n\nJoy-Ann Lewis"),
  ]),
  // ER01720: the PDF went out after the notice, HPD said nothing yet.
  ppn("p2", "ER01720", "2026-10-27T14:00:00Z"),
  side("s2", "Re: OMO No: ER01720", "ER01720", [mine("2026-10-30T13:30:00Z", ["ER01720 AFF INVOICE.pdf"])]),
  // EP27382: "Received." after the PDF -> confirmed by itself.
  ppn("p3", "EP27382", "2026-10-20T14:00:00Z"),
  side("s3", "Re: EP27382", "EP27382", [mine("2026-10-20T15:00:00Z", ["EP27382 AFF INVOICE.pdf"]), hpd("2026-10-21T13:24:00Z", "Good day,\n\nReceived.\n\nDeoranie Gafur (She/Her)|Vendor Tracker")]),
  // ER03009: nothing sent.
  ppn("p4", "ER03009", "2026-11-04T14:00:00Z"),
];
const rowOf = (rows, omo) => rows.find((r) => r.omo === omo);
let rows = buildBoard({ threads, sent: {}, marks: {}, closed: new Set(), now });

const r272 = rowOf(rows, "ER00272");
assert.ok(r272.problem, "HPD's 'the copy is blank' after our PDF is a problem");
assert.equal(r272.problem.text, "Hi Jot, Please note the copy you just resubmitted is blank.");
assert.equal(r272.steps.sent.done, false, "a blank copy doesn't count as sent");
assert.equal(boardSide(r272), "tosend");
const r1720 = rowOf(rows, "ER01720");
assert.equal(r1720.steps.sent.done, true, "the AFF INVOICE in another email counts as sent");
assert.equal(boardSide(r1720), "waiting", "sent: waiting, never 'overdue'");
const r382 = rowOf(rows, "EP27382");
assert.equal(r382.next, null, "'Received.' after the PDF confirms it");
assert.match(r382.answered.text, /^Good day, Received\./);
assert.equal(boardSide(rowOf(rows, "ER03009")), "tosend");

// ✅ Already sent / fixed (any phone): done; an older mark doesn't hide a newer notice.
rows = buildBoard({ threads, sent: {}, marks: {}, closed: new Set(), now, handled: { ER00272: "2026-11-05T14:00:00Z", ER03009: "2026-11-01T00:00:00Z" } });
assert.equal(rowOf(rows, "ER00272").next, null);
assert.equal(rowOf(rows, "ER00272").handledAt, "2026-11-05T14:00:00Z");
assert.ok(rowOf(rows, "ER03009").next, "handled before the notice came: still open");
// A correction saved in the app after HPD's problem email: fixed (it goes by mail).
rows = buildBoard({ threads, sent: {}, marks: {}, closed: new Set(), now, fixed: { ER00272: "2026-10-28T12:00:00Z" } });
assert.equal(rowOf(rows, "ER00272").problem, null);
assert.equal(rowOf(rows, "ER00272").steps.sent.done, true);

// HPD's words: no quoted email, no signature; a new notice isn't an answer.
assert.equal(hpdWords("Received.\n\nOn Mon, Oct 26, 2026 at 2:19 PM Lewis wrote:\n> old"), "Received.");
assert.equal(hpdAnswerAfter([hpd("2026-10-02T00:00:00Z", "Kindly see attached 24 HR POOR PERFORMANCE NOTICE for OMO#X")], "2026-10-01T00:00:00Z").ok, null);

// The words.
const said = (t) => parseCommand(t);
assert.deepEqual(said("go through my notices"), { intent: "notice-walk", next: false });
assert.deepEqual(said("work on the notices"), { intent: "notice-walk", next: false });
assert.deepEqual(said("let's do the notices"), { intent: "notice-walk", next: false });
assert.deepEqual(said("next notice"), { intent: "notice-walk", next: true });
assert.deepEqual(said("I already sent it"), { intent: "notice-handled", ref: "" });
assert.deepEqual(said("ER00272 is already fixed"), { intent: "notice-handled", ref: "ER00272" });
assert.deepEqual(said("I already answered ER 00272"), { intent: "notice-handled", ref: "ER00272" });
assert.equal(said("I already sent the bid").intent === "notice-handled", false, "bids aren't notices");
assert.deepEqual(said("tomorrow's bids"), { intent: "next-bid", day: "1" });
assert.deepEqual(said("next bid tomorrow"), { intent: "next-bid", day: "1" });
assert.deepEqual(said("next bid"), { intent: "next-bid" });
assert.equal(said("which notices are open").intent, "notices");

// The walk's next step, when the card's code loads here.
if (walkNext) {
  const f = { address: "", where: "", work: "", tenant: null, calls: [], found: [], outcome: "" };
  const fresh = buildBoard({ threads, sent: {}, marks: {}, closed: new Set(), now });
  assert.equal(walkNext(rowOf(fresh, "ER00272"), f).go, "fix");
  assert.equal(walkNext(rowOf(fresh, "ER01720"), f).go, "wait");
  assert.equal(walkNext(rowOf(fresh, "ER03009"), f).go, "reply");
  assert.equal(walkNext(rowOf(fresh, "ER03009"), { ...f, outcome: "work_completed" }).go, "make");
  assert.match(walkClock(rowOf(fresh, "ER03009"), now), /^OVERDUE/);
}
console.log(`PASS notice flow: HPD's answer after our PDF (blank -> to send, Received -> confirmed), the PDF in another email counts as sent (no 'overdue'), already sent / fixed on any phone, a correction saved fixes it; go through my notices / already sent / tomorrow's bids${walkNext ? "; the walk's next step" : ""}`);
