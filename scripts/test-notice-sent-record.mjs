// Sent notices don't stay overdue (owner, 10 Nov: "sent notices must not stay as overdue: check everything sent, mark
// the emails clearly"). The Gmail Sent record (sent_paperwork.json: any email or fax with the job's AFF INVOICE) from
// the notice's day on counts as sent, like our email with the PDF; a record after HPD's send-back means the corrected
// copy went out. The real cases from 11 Nov: ER03009 (72-hour notice 10/22, AFF INVOICE sent 10/23, no reply in the
// thread) and ER04312 (24-hour notice, HPD sent it back 10/21, corrected copy sent 11/10).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildBoard, boardSide, urgentRows } = await loadLib("notice-board");

const now = Date.parse("2026-11-11T15:00:00Z");
const hpd = (at, text = "Notice. Joy-Ann Lewis lewisj@hpd.nyc.gov") => ({ at, text, hpd: true, mine: false });
const mine = (at, files = []) => ({ at, text: "reply", hpd: false, mine: true, files });
const t = (id, subject, omo, messages) => ({ id, subject, omos: [omo], people: ["Joy-Ann Lewis"], messages });
const threads = [
  t("a", "72HR POOR PERFORMANCE NOTICE- OMO#ER03009", "ER03009", [hpd("2026-10-22T14:00:00Z")]),
  t("b", "24 HR POOR PERFORMANCE NOTICE- OMO#ER04312", "ER04312", [hpd("2026-10-16T15:00:00Z"), mine("2026-10-19T13:00:00Z", ["ER04312 AFF INVOICE.pdf"]),
    hpd("2026-10-21T14:00:00Z", "Kindly see attached affidavit & invoice with highlighted errors")]),
  // Sent long before this notice: not an answer to it.
  t("c", "24 HR POOR PERFORMANCE NOTICE- OMO#ER00001", "ER00001", [hpd("2026-11-09T14:00:00Z")]),
  // Sent back by HPD the same day the record says: can't tell the order, so it stays to fix.
  t("d", "24 HR POOR PERFORMANCE NOTICE- OMO#ER00002", "ER00002", [hpd("2026-11-03T14:00:00Z"), mine("2026-11-04T13:00:00Z", ["ER00002 AFF INVOICE.pdf"]),
    hpd("2026-11-05T14:00:00Z", "The copy is blank")]),
];
const sent = { ER03009: { sentAt: "2026-10-23" }, ER04312: { sentAt: "2026-11-10" }, ER00001: { sentAt: "2026-07-02" }, ER00002: { sentAt: "2026-11-05" } };
const by = Object.fromEntries(buildBoard({ threads, sent, marks: {}, now }).map((r) => [r.omo, r]));

assert.equal(by.ER03009.steps.sent.done, true, "ER03009: the AFF INVOICE sent the day after the notice counts");
assert.equal(by.ER03009.steps.sent.how, "record");
assert.equal(by.ER03009.steps.sent.at, "2026-10-23", "marked with the day it went out");
assert.notEqual(boardSide(by.ER03009), "tosend", "off To send");

assert.equal(by.ER04312.problem, null, "ER04312: the corrected copy sent after HPD's send-back settles it");
assert.equal(by.ER04312.steps.sent.at, "2026-11-10", "the later send (the correction) is the one shown");
assert.equal(boardSide(by.ER04312), "waiting", "sent 11/10, waiting for HPD: their 10/21 send-back isn't a confirmation");

assert.equal(by.ER00001.steps.sent.done, false, "a send months before the notice doesn't answer it");
assert.equal(boardSide(by.ER00001), "tosend");

assert.ok(by.ER00002.problem, "same day as HPD's send-back: still to fix");
assert.equal(boardSide(by.ER00002), "tosend");

const late = urgentRows(Object.values(by), now).map((r) => r.omo).sort();
assert.deepEqual(late, ["ER00001"], "only the notice with nothing sent is overdue");
console.log("PASS notice sent record: Gmail Sent AFF INVOICE after the notice = sent (ER03009 10/23), a correction sent after HPD's send-back = fixed (ER04312 11/10); older or same-day sends don't count; only the unsent notice is overdue");
