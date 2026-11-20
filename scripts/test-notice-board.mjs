// The 24 / 72-hour board (lib/notice-board.ts): steps tick from the emails, the paperwork on record or a tap.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { boardSide, buildBoard, daysWaiting, draftReply, hoursLeft, urgentRows } = await loadLib("notice-board");

const now = Date.parse("2026-10-19T10:00:00Z"); // Monday: the Friday 10/16 notices are due today (weekdays only)
const hpd = (at, text = "Notice. Darlene Lewis lewisd@hpd.nyc.gov") => ({ at, text, hpd: true, mine: false });
const mine = (at, files = []) => ({ at, text: "reply", hpd: false, mine: true, files });
const t = (id, subject, omo, messages) => ({ id, subject, omos: [omo], people: ["Darlene Lewis"], messages });
const threads = [
  t("a", "24 HR POOR PERFORMANCE NOTICE- OMO#ER05228", "ER05228", [hpd("2026-10-16T15:39:00Z")]),
  t("b", "OMO#EQ31123- 24 HR POOR PERFORMANCE NOTICE", "EQ31123", [hpd("2026-10-16T15:51:00Z"), mine("2026-10-16T17:00:00Z", ["aff.pdf", "inv.pdf"])]),
  t("c", "72HR POOR PERFORMANCE NOTICE- OMO#EQ30401", "EQ30401", [hpd("2026-10-16T15:56:00Z"), mine("2026-10-16T16:30:00Z")]),
  t("d", "24 HR POOR PERFORMANCE NOTICE - OMO#EQ1", "EQ00001", [hpd("2026-10-10T15:00:00Z"), mine("2026-10-10T18:00:00Z", ["a.pdf"]), hpd("2026-10-11T12:00:00Z", "Received, thank you")]),
  t("e", "24 HR POOR PERFORMANCE NOTICE - OMO#EQ2", "EQ00002", [hpd("2026-08-01T15:00:00Z")]), // too old
  t("f", "Award letter OMO#EQ3", "EQ00003", [hpd("2026-10-16T15:00:00Z")]), // not a notice
  t("g", "24 HR POOR PERFORMANCE NOTICE - OMO#EQ4", "EQ00004", [hpd("2026-10-16T15:00:00Z")]),
];
const rows = buildBoard({ threads, sent: { EQ30401: { sentAt: "2026-10-01" } }, marks: { "EQ00004:g": { replied: "2026-10-17T09:00:00Z" } }, closed: new Set(), now });
assert.deepEqual(rows.map((r) => r.omo), ["EQ00004", "ER05228", "EQ30401", "EQ31123", "EQ00001"], "to do by deadline, then sent / waiting, done last");
const by = Object.fromEntries(rows.map((r) => [r.omo, r]));
assert.equal(by.ER05228.hours, 24);
assert.equal(by.ER05228.dueAt, "2026-10-19T14:00:00.000Z", "Friday 24-hour notice: due first thing Monday (10 AM)");
assert.equal(by.ER05228.to, "lewisd@hpd.nyc.gov");
assert.equal(by.ER05228.next, "replied");
assert.equal(by.EQ31123.next, "confirmed", "reply with the PDFs = replied, made, sent");
assert.equal(by.EQ31123.steps.sent.how, "email");
assert.equal(by.EQ30401.hours, 72);
assert.equal(by.EQ30401.next, "sent", "replied by email, paperwork on record, not sent yet");
assert.equal(by.EQ30401.steps.made.how, "record");
assert.equal(by.EQ00001.next, null, "their answer after our PDFs = confirmed");
assert.equal(by.EQ00004.steps.replied.how, "tap");
assert.ok(Math.abs(hoursLeft(by.ER05228, now) - 4) < 0.01, "6 AM Monday: 4 hours to 10 AM");
assert.deepEqual(urgentRows(rows, now).map((r) => r.omo), ["EQ00004", "ER05228"], "under 6 hours, nothing sent");
// Closed at HPD / PIP paid: done.
assert.equal(buildBoard({ threads: [threads[0]], sent: {}, marks: {}, closed: new Set(["ER05228"]), now })[0].next, null);
// Drafts: what's true for each job.
assert.match(draftReply(by.ER05228, "1 MAIN ST").text, /^Hello Darlene,\n\nRe: OMO# ER05228 - 1 MAIN ST\n\nWe received your notice/);
assert.match(draftReply(by.EQ30401, "").text, /were sent on 10\/1\/2026/);
assert.match(draftReply(by.EQ31123, "").text, /were sent\./);
assert.equal(draftReply(by.ER05228, "").subject, "RE: 24 HR POOR PERFORMANCE NOTICE- OMO#ER05228");
// Missing-documents lists (Gafur): one row per job, what they want, steps per job (our PDFs must name the OMO).
const list = "These are the list of OMOs that are missing documents.\n1. EP27489 - Affidavit and Invoice\n2. EO18305 - photos\n3. EP27310 - update / documents\nDeoranie Gafur gafurd@hpd.nyc.gov";
const docsThread = { id: "m", subject: "Missing Documents", omos: ["EP27489", "EO18305", "EP27310"], people: ["Deoranie Gafur"], messages: [
  hpd("2026-10-07T15:25:00-04:00", list),
  { at: "2026-10-09T10:00:00-04:00", text: "Attached for OMO EO18305", hpd: false, mine: true, files: ["photos.pdf"] },
  hpd("2026-10-16T15:26:00-04:00", "Following up on the list"),
] };
const docs = buildBoard({ threads: [docsThread], sent: { EP27489: { sentAt: "2026-09-20" } }, marks: {}, now });
const d = Object.fromEntries(docs.map((r) => [r.omo, r]));
assert.equal(docs.length, 3);
assert.equal(d.EP27489.kind, "docs");
assert.equal(d.EP27489.want, "Affidavit and Invoice");
assert.equal(d.EO18305.want, "photos");
assert.equal(d.EP27489.to, "gafurd@hpd.nyc.gov");
assert.equal(d.EP27489.dueAt, "");
assert.equal(hoursLeft(d.EP27489, now), Infinity);
assert.equal(daysWaiting(d.EP27489, now), 11);
assert.equal(d.EP27489.followUpAt, "2026-10-16T15:26:00-04:00");
assert.equal(d.EO18305.next, "confirmed", "our PDFs naming EO18305 = sent");
assert.equal(d.EP27310.steps.sent.done, false, "PDFs for another job don't count for this one");
assert.equal(d.EP27489.next, "replied");
assert.equal(d.EP27489.steps.made.how, "record");
assert.deepEqual(urgentRows(docs, now), [], "no deadline, no 6-hour reminder");
assert.match(draftReply(d.EP27489, "").text, /were sent on 9\/20\/2026\. We will send them to you again today/);
assert.match(draftReply(d.EO18305, "").text, /The photos for this job were sent/);
assert.match(draftReply(d.EP27310, "").text, /will send the affidavit and invoice \(or an update\) as soon as possible/);
// Notices with a deadline come before the lists.
assert.equal(buildBoard({ threads: [docsThread, threads[0]], sent: {}, marks: {}, now })[0].kind, "ppn");
console.log("PASS notice board: missing-documents lists (one row per job, what they want, steps per job, no deadline); 5 notices (2 too old / not notices left out), steps from emails / record / taps, deadlines 24 vs 72 h, under-6-hour reminder, closed = done, drafts say what's true");
// Weekdays only (owner, 18 Oct): Friday / weekend 24 h -> first thing Monday (10 AM), Friday 72 h -> Wednesday,
// Tuesday 24 h -> Wednesday same time.
const { dueAfterWeekdays } = await loadLib("business-days");
assert.equal(dueAfterWeekdays("2026-10-16T15:39:00-04:00", 24), "2026-10-19T14:00:00.000Z");
assert.equal(dueAfterWeekdays("2026-10-16T15:39:00-04:00", 72), "2026-10-21T19:39:00.000Z");
assert.equal(dueAfterWeekdays("2026-10-13T09:00:00-04:00", 24), "2026-10-14T13:00:00.000Z");
assert.equal(dueAfterWeekdays("2026-10-17T11:00:00-04:00", 24), "2026-10-19T14:00:00.000Z");
assert.equal(dueAfterWeekdays("2026-12-04T16:00:00-05:00", 24), "2026-12-07T15:00:00.000Z", "winter time: Monday 10 AM EST");
// City holidays (19 Oct): none is a due day.
const { nycHolidays, holidayOn, holidaysBetween } = await loadLib("business-days");
assert.deepEqual(holidaysBetween("2026-10-09T14:00:00-04:00", "2026-10-13T14:00:00.000Z"), ["Columbus Day"]);
assert.deepEqual([...nycHolidays(2026).keys()], ["2026-01-01", "2026-01-19", "2026-02-12", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-03", "2026-11-11", "2026-11-26", "2026-12-25"]);
assert.equal(holidayOn(Date.parse("2026-11-26T12:00:00-05:00")), "Thanksgiving");
assert.equal(dueAfterWeekdays("2026-11-25T14:00:00-05:00", 24), "2026-11-27T15:00:00.000Z", "Wednesday before Thanksgiving: Friday 10 AM");
assert.equal(dueAfterWeekdays("2026-11-02T14:00:00-05:00", 24), "2026-11-04T15:00:00.000Z", "Monday before Election Day: Wednesday 10 AM");
assert.equal(dueAfterWeekdays("2026-10-09T14:00:00-04:00", 24), "2026-10-13T14:00:00.000Z", "Friday before Columbus Day: Tuesday 10 AM");
assert.equal(dueAfterWeekdays("2026-11-24T14:00:00-05:00", 72), "2026-11-30T19:00:00.000Z", "72h from Tuesday skips Thanksgiving: Wed, Fri, Mon");
assert.equal(dueAfterWeekdays("2027-12-30T10:00:00-05:00", 24), "2028-01-03T15:00:00.000Z", "Thursday 30 Dec 2027, New Year's kept on Fri 31 Dec: Monday 10 AM");
console.log("PASS weekdays only (and City holidays): Friday / weekend 24h -> Monday 10 AM, Friday 72h -> Wednesday, Tuesday 24h -> Wednesday");

// No answer -> ask them to confirm (19 Oct): 5 days after our paperwork with no answer; the clock restarts after we ask.
const { nudgeDays, draftNudge } = await loadLib("notice-board");
const quietRow = { key: "k", omo: "EP12345", who: "Lewis Tracker", subject: "MISSING DOCUMENTS", kind: "docs", want: "Affidavit and Invoice", next: "confirmed", sentAt: "", steps: { replied: { done: true, at: "2026-10-08T15:00:00Z", how: "email" }, made: { done: true, at: "2026-10-08T15:00:00Z", how: "email" }, sent: { done: true, at: "2026-10-08T15:00:00Z", how: "email" }, confirmed: { done: false, at: "", how: "" } } };
const oct = (d) => Date.parse(`2026-10-${d}T16:00:00Z`);
assert.equal(nudgeDays(quietRow, oct(12)), 0, "4 days: not yet");
assert.equal(nudgeDays(quietRow, oct(19)), 11);
assert.equal(nudgeDays(quietRow, oct(19), "2026-10-17T12:00:00Z"), 0, "asked again 2 days ago: wait");
assert.equal(nudgeDays({ ...quietRow, next: "sent" }, oct(19)), 0, "not sent yet: not a nudge");
assert.equal(nudgeDays({ ...quietRow, next: null }, oct(19)), 0, "confirmed: nothing to ask");
const nd = draftNudge(quietRow, "123 Main St");
assert.equal(nd.subject, "RE: MISSING DOCUMENTS");
assert.match(nd.text, /^Hello Lewis,\n\nRe: OMO# EP12345 - 123 Main St\n\nFollowing up: the affidavit and invoice for this job were sent to you on 10\/8\/2026\. Can you please confirm/);
console.log("PASS no answer: flagged after 5 days with no answer, waits again after asking, follow-up names the job and the date sent");

// To send / Sent · waiting / They replied (owner, 22 Oct: "once I hit send to vendor it goes to sent, waiting for a
// reply; the not-sent on one side, the sent on another").
{
  const { boardSide } = await loadLib("notice-board");
  const hpd = (at, text = "x@hpd.nyc.gov") => ({ at, hpd: true, mine: false, text, files: [] });
  const me = (at, text = "", files = []) => ({ at, hpd: false, mine: true, text, files });
  const now = Date.parse("2026-10-22T15:00:00Z");
  const threads = [
    { id: "a", subject: "72 HR POOR PERFORMANCE NOTICE - OMO#EQ00001", omos: ["EQ00001"], people: ["Joy-Ann Lewis"], messages: [hpd("2026-10-20T14:00:00Z")] },
    { id: "b", subject: "72 HR POOR PERFORMANCE NOTICE - OMO#EQ00002", omos: ["EQ00002"], people: ["Joy-Ann Lewis"], messages: [hpd("2026-10-19T14:00:00Z"), me("2026-10-20T14:00:00Z", "We are working on it")] },
    { id: "c", subject: "72 HR POOR PERFORMANCE NOTICE - OMO#EQ00003", omos: ["EQ00003"], people: ["Joy-Ann Lewis"], messages: [hpd("2026-10-19T14:00:00Z"), me("2026-10-20T14:00:00Z", "Update"), hpd("2026-10-21T14:00:00Z", "Please send the affidavit x@hpd.nyc.gov")] },
    { id: "d", subject: "Missing Documents", omos: ["EQ00004", "EQ00005"], people: ["Gafur"], messages: [hpd("2026-10-15T14:00:00Z", "EQ00004 - affidavit\nEQ00005 - photos\nx@hpd.nyc.gov"), me("2026-10-16T14:00:00Z", "EQ00004 sent on 10/1"), hpd("2026-10-17T14:00:00Z", "Thank you, EQ00004 received x@hpd.nyc.gov")] },
  ];
  const rows = buildBoard({ threads, sent: {}, marks: {}, now });
  const side = (omo) => boardSide(rows.find((r) => r.omo === omo));
  assert.equal(side("EQ00001"), "tosend", "nothing sent yet");
  assert.equal(side("EQ00002"), "waiting", "sent, no answer");
  assert.equal(side("EQ00003"), "replied", "they wrote back after ours");
  assert.equal(side("EQ00004"), "replied", "Gafur answered after our reply naming the job");
  assert.equal(side("EQ00005"), "tosend", "our reply didn't name EQ00005");
  // Hitting Send in the app (ticks Reply sent) moves it at once, before the email is read back.
  const after = buildBoard({ threads, sent: {}, marks: { "EQ00001:a": { replied: "2026-10-22T14:59:00Z" } }, now });
  assert.equal(boardSide(after.find((r) => r.omo === "EQ00001")), "waiting");
  console.log("PASS board sides: 📝 to send / 📤 sent · waiting / 💬 they replied; Send moves a job to Sent right away; a list reply counts only for the jobs it names");
}

// Gafur's list vs what's already emailed (owner, 22 Oct: "AFF INVOICE is labeled with every OMO; I don't want to repeat
// what I've sent"): a PDF named for the job counts as sent (her thread or any other), with no text needed; "Received."
// right after it confirms that job only; a note to the whole list doesn't move the others out of To send.
{
  const { boardSide } = await loadLib("notice-board");
  const hpd = (at, text = "x@hpd.nyc.gov") => ({ at, hpd: true, mine: false, text, files: ["image001.png"] });
  const me = (at, text = "", files = ["image001.png"]) => ({ at, hpd: false, mine: true, text, files });
  const now = Date.parse("2026-10-22T15:00:00Z");
  const threads = [
    { id: "g", subject: "Missing Documents", omos: ["EO32701", "EP27382", "EP27310", "EO18305"], people: ["Deoranie Gafur"], messages: [
      hpd("2026-10-07T19:25:00Z", "1. EO32701 - update / documents\n2. EP27382 - Affidavit and Invoice\n3. EP27310 - update / documents\n4. EO18305 - photos\nx@hpd.nyc.gov"),
      me("2026-10-19T14:00:00Z", "I will send all of the missing items back to you today."),
      me("2026-10-20T14:57:00Z", "", ["EO32701 AFF INVOICE.pdf", "image001.png"]),
      hpd("2026-10-21T12:58:00Z", "Received. x@hpd.nyc.gov"),
    ] },
    { id: "p", subject: "OMO No: EP27382 correction", omos: ["EP27382"], people: ["Procurement"], messages: [hpd("2026-10-15T14:00:00Z"), me("2026-10-20T15:00:00Z", "attached", ["EP27382 AFF INVOICE.pdf"])] },
    { id: "o", subject: "OMO EO18305", omos: ["EO18305"], people: ["X"], messages: [hpd("2026-08-01T14:00:00Z"), me("2026-08-19T15:00:00Z", "", ["EO18305 AFF INVOICE.pdf"])] },
  ];
  const rows = buildBoard({ threads, sent: {}, marks: {}, now, docsDays: 40 });
  const row = (omo) => rows.find((r) => r.omo === omo && r.threadId === "g");
  assert.equal(boardSide(row("EO32701")), "done", "PDF with no text + 'Received.' = confirmed");
  assert.equal(row("EO32701").filed.name, "EO32701 AFF INVOICE.pdf");
  assert.equal(boardSide(row("EP27382")), "waiting", "PDF sent in another thread counts: not to send again");
  assert.equal(row("EP27382").filed.here, false);
  assert.equal(boardSide(row("EP27310")), "tosend", "the note to the whole list doesn't count as sent");
  assert.equal(boardSide(row("EO18305")), "tosend", "she wants photos: an old affidavit PDF isn't that");
  console.log("PASS Gafur's list vs emails: PDFs named for the job count as sent (any thread, no text needed), 'Received.' confirms only that job, a note to the whole list leaves the rest to send, photos asks need photos");
}

// 🔁 HPD asked twice (owner's idea, 14 Nov): a notice for a job whose affidavit / invoice was already emailed before
// it shows that date and file; a file sent after the notice is the normal "sent"; nothing sent = no flag.
{
  const tw = [
    t("p1", "24 HR POOR PERFORMANCE NOTICE- OMO#ER11111", "ER11111", [hpd("2026-10-16T15:00:00Z")]),
    { id: "old", subject: "Paperwork OMO#ER11111", omos: ["ER11111"], people: ["Darlene Lewis"], messages: [mine("2026-10-09T14:00:00Z", ["ER11111 AFF INVOICE.pdf"])] },
    t("p2", "24 HR POOR PERFORMANCE NOTICE- OMO#ER22222", "ER22222", [hpd("2026-10-16T15:00:00Z"), mine("2026-10-16T18:00:00Z", ["ER22222 AFF INVOICE.pdf"])]),
    { id: "old2", subject: "Paperwork OMO#ER22222", omos: ["ER22222"], people: [], messages: [mine("2026-10-02T14:00:00Z", ["ER22222 AFF INVOICE.pdf"])] },
    t("p3", "24 HR POOR PERFORMANCE NOTICE- OMO#ER33333", "ER33333", [hpd("2026-10-16T15:00:00Z")]),
  ];
  const r = Object.fromEntries(buildBoard({ threads: tw, sent: {}, marks: {}, closed: new Set(), now }).map((x) => [x.omo, x]));
  assert.deepEqual(r.ER11111.askedTwice, { at: "2026-10-09T14:00:00Z", name: "ER11111 AFF INVOICE.pdf" }, "already emailed before the notice");
  assert.equal(r.ER11111.next, "replied", "still needs a reply (with that date)");
  assert.equal(r.ER22222.askedTwice, null, "sent again after the notice: no flag");
  assert.equal(r.ER33333.askedTwice, null, "never sent: no flag");
  console.log("PASS HPD asked twice: a notice after the job's paperwork was already emailed shows that date and file; sent after the notice or never sent = no flag");
}
{
  // One notice email listing many jobs, each with its own deadline (20 Nov, live: Lewis's "24 HR & 72 HR POOR PERFORMANCE
  // NOTICES" named 18 jobs; the board showed only the first, "Lewis 0"). Our "received the list" reply = replied for all.
  const at = "2026-11-18T20:49:36Z"; // Wednesday 3:49 PM New York
  const text = "Kindly see attached.\nOMO#ER70001- 24 HR POOR PERFORMANCE NOTICE\nOMO#ER70002-24 HR POOR PERFORMANCE NOTICE\nOMO#ER70003-72 HR POOR PERFORMANCE NOTICE\nOMO#ER70004- 72 HR POOR PERFORMANCE NOTICE\nJoy-Ann Lewis LewisJ@hpd.nyc.gov";
  const list = { id: "L", subject: "24 HR & 72 HR POOR PERFORMANCE NOTICES", omos: ["ER70001", "ER70002", "ER70003", "ER70004"], people: ["Joy-Ann Lewis"], messages: [
    { at, text, hpd: true, mine: false, files: ["NOTICES.pdf"] },
    { at: "2026-11-19T13:39:00Z", text: "Thank you, we received the list.", hpd: false, mine: true, files: ["Outlook-abc.png"] },
    { at: "2026-11-19T15:38:00Z", text: "Noted and thank you.", hpd: true, mine: false },
    { at: "2026-11-19T14:00:00Z", text: "Here is the paperwork for ER70004", hpd: false, mine: true, files: ["ER70004 AFF INVOICE.pdf"] },
  ] };
  const plain = { id: "P", subject: "72 HR POOR PERFORMANCE NOTICE- OUTSTANDING OMOS", omos: ["ER80001", "ER80002"], people: ["Joy-Ann Lewis"], messages: [{ at, text: "72 HR notices\nER80001\nER80002", hpd: true, mine: false }] };
  const r = buildBoard({ threads: [list, plain], sent: {}, marks: {}, closed: new Set(), now: Date.parse("2026-11-20T15:00:00Z") });
  const b = Object.fromEntries(r.map((x) => [x.omo, x]));
  assert.deepEqual(Object.keys(b).sort(), ["ER70001", "ER70002", "ER70003", "ER70004", "ER80001", "ER80002"], "every job on the list has its own row");
  assert.equal(b.ER70001.hours, 24); assert.equal(b.ER70002.hours, 24);
  assert.equal(b.ER70003.hours, 72); assert.equal(b.ER80001.hours, 72, "no per-job line: the subject's hours");
  assert.equal(b.ER70001.dueAt, "2026-11-19T20:49:36.000Z", "24 hours from Wednesday 3:49 PM");
  assert.equal(b.ER70003.dueAt, "2026-11-23T20:49:36.000Z", "72 weekday hours: Monday 3:49 PM");
  assert.equal(b.ER70001.next, "made", "the 'received the list' reply counts as replied; the signature picture is not paperwork");
  assert.ok(b.ER70004.steps.sent.done, "paperwork named for the job = sent");
  assert.equal(boardSide(b.ER70001), "tosend", "a note to the whole list (and HPD's 'noted') leaves the job to send, not 'HPD answered'");
  assert.equal(b.ER70003.steps.sent.done, false, "another job's paperwork doesn't count");
  assert.equal(b.ER80002.next, "replied");
  assert.equal(b.ER70004.next, null, "HPD's \"noted\" after its paperwork: done");
  assert.equal(r.filter((x) => x.next && x.kind === "ppn").length, 5, "the Lewis tab counts every open one");
  console.log("PASS one notice email for many jobs: a row per job with its own 24 / 72 hours, the list reply counts for all, paperwork only for the job it names");
}
