// Vendor tracking as a conversation (lib/notice-convo.ts): theirs and ours in time order, each of ours saying how the
// app knows (found in your sent email = verified, made in the app, or marked by you), and the PDF that went out.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildBoard } = await loadLib("notice-board");
const { noticeConvo, isNewSince } = await loadLib("notice-convo");

const now = Date.parse("2026-10-19T10:00:00Z");
const hpd = (at, text = "Notice. Darlene Lewis lewisd@hpd.nyc.gov") => ({ at, text, hpd: true, mine: false });
const mine = (at, files = []) => ({ at, text: "reply", hpd: false, mine: true, files });
const t = (id, subject, omo, messages) => ({ id, subject, omos: [omo], people: ["Darlene Lewis"], messages });
const threads = [
  // Replied, sent the PDF, she said thank you.
  t("d", "24 HR POOR PERFORMANCE NOTICE - OMO#EQ00001", "EQ00001", [hpd("2026-10-10T15:00:00Z"), mine("2026-10-10T18:00:00Z", ["EQ00001 AFF INVOICE.pdf"]), hpd("2026-10-11T12:00:00Z", "Received, thank you")]),
  // Nothing sent yet.
  t("a", "24 HR POOR PERFORMANCE NOTICE- OMO#ER05228", "ER05228", [hpd("2026-10-16T15:39:00Z")]),
  // Sent ticked by hand only: not found in email.
  t("c", "72HR POOR PERFORMANCE NOTICE- OMO#EQ30401", "EQ30401", [hpd("2026-10-16T15:56:00Z")]),
];
const rows = buildBoard({ threads, sent: {}, marks: { "EQ30401:c": { sent: "2026-10-17T09:00:00Z" } }, closed: new Set(), now });
const row = (omo) => rows.find((r) => r.omo === omo);

const full = noticeConvo(row("EQ00001"));
assert.deepEqual(full.map((m) => m.side), full.map((m) => (m.id === "notice" || m.id === "answer" || m.id === "confirmed" ? "theirs" : "ours")), "theirs left, ours right");
assert.equal(full[0].id, "notice", "starts with their notice");
for (let i = 1; i < full.length; i++) if (full[i].at && full[i - 1].at) assert.ok(Date.parse(full[i].at) >= Date.parse(full[i - 1].at), "time order");
const sent = full.find((m) => m.id === "sent");
assert.ok(sent, "the send shows");
assert.equal(sent.proof, "email", "found in your sent email: verified");
assert.match(sent.file || "", /EQ00001/, "the PDF that went out is named");

const fresh = noticeConvo(row("ER05228"));
assert.deepEqual(fresh.map((m) => m.id), ["notice"], "nothing sent yet: only their notice");
assert.match(fresh[0].title, /24-hour notice/);

const tapped = noticeConvo(row("EQ30401")).find((m) => m.id === "sent");
assert.ok(tapped, "a send you ticked shows");
assert.equal(tapped.proof, "you", "ticked by hand is not verified");
assert.match(tapped.detail, /Not found in your sent email/);

assert.equal(isNewSince({ at: "2026-10-11T12:00:00Z" }, "2026-10-11T00:00:00Z"), true, "came after you looked: NEW");
assert.equal(isNewSince({ at: "2026-10-10T12:00:00Z" }, "2026-10-11T00:00:00Z"), false);
assert.equal(isNewSince({ at: "2026-10-10T12:00:00Z" }, ""), false, "first look: nothing flagged");
console.log("PASS notice conversation: their notice first, ours on the right in time order; a send found in your email is verified with its PDF named; a send ticked by hand says it isn't found in email; NEW since you last looked");
