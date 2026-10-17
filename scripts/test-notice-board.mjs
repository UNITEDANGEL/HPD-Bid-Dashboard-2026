// The 24 / 72-hour board (lib/notice-board.ts): steps tick from the emails, the paperwork on record or a tap.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildBoard, daysWaiting, draftReply, hoursLeft, urgentRows } = await loadLib("notice-board");

const now = Date.parse("2026-10-17T10:00:00Z");
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
assert.equal(by.ER05228.dueAt, "2026-10-17T15:39:00.000Z");
assert.equal(by.ER05228.to, "lewisd@hpd.nyc.gov");
assert.equal(by.ER05228.next, "replied");
assert.equal(by.EQ31123.next, "confirmed", "reply with the PDFs = replied, made, sent");
assert.equal(by.EQ31123.steps.sent.how, "email");
assert.equal(by.EQ30401.hours, 72);
assert.equal(by.EQ30401.next, "sent", "replied by email, paperwork on record, not sent yet");
assert.equal(by.EQ30401.steps.made.how, "record");
assert.equal(by.EQ00001.next, null, "their answer after our PDFs = confirmed");
assert.equal(by.EQ00004.steps.replied.how, "tap");
assert.ok(Math.abs(hoursLeft(by.ER05228, now) - 5.65) < 0.01);
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
assert.equal(daysWaiting(d.EP27489, now), 9);
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
