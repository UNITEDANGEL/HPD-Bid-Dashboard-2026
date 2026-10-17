// The 24 / 72-hour board (lib/notice-board.ts): steps tick from the emails, the paperwork on record or a tap.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildBoard, draftReply, hoursLeft, urgentRows } = await loadLib("notice-board");

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
console.log("PASS notice board: 5 notices (2 too old / not notices left out), steps from emails / record / taps, deadlines 24 vs 72 h, under-6-hour reminder, closed = done, drafts say what's true");
