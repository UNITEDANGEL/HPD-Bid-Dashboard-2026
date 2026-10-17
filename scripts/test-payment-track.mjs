// Rejections tracked to the money (lib/payment-track.ts): steps from the print folder, the paperwork on record and
// PIP; dollars held / paid / lost; money held first.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { trackPayments, money, PAY_STEPS } = await loadLib("payment-track");
const now = Date.parse("2026-10-17T12:00:00Z");
const rj = (omo, at, pay, openAmount, paidAmount = 0, extra = {}) => ({ omo, at, by: "HPD", reason: "Address is spelled incorrectly", attempt: "FIRST ATTEMPT", count: 1, answered: false, correctedAt: "", address: `${omo} ST`, onMap: true, pay, paidAmount, openAmount, ...extra });
const rejections = [
  rj("EP19269", "2026-09-25", "payable", 570),
  rj("EP21054", "2026-09-25", "payable", 490),
  rj("EQ17038", "2026-10-01", "payable", 1200),
  rj("EQ10001", "2026-09-01", "paid", 0, 800),
  rj("EQ10002", "2026-09-10", "lost", 0, 0),
  rj("EQ10003", "2026-03-01", "paid", 0, 300), // paid long ago: left out
  rj("EQ10004", "2026-09-20", "", 0),           // not in PIP yet: kept, amount unknown
  rj("EQ10006", "2026-09-20", "", 0, 0, { answered: true }), // not in PIP and answered: left out
  rj("EQ10005", "2026-09-28", "payable", 350, 0, { correctedAt: "2026-10-02" }),
];
const corrections = [
  { omo: "EQ17038", savedAt: "2026-10-05T10:00:00Z", printedAt: "2026-10-05T11:00:00Z", emailedAt: "2026-10-05T12:00:00Z", mailedAt: "2026-10-06T09:00:00Z" },
  { omo: "EP21054", savedAt: "2026-10-03T10:00:00Z", printedAt: "2026-10-03T11:00:00Z" },
  { omo: "EP19269", savedAt: "2026-08-01T10:00:00Z" }, // a fix from before this rejection doesn't count
];
const { rows, summary } = trackPayments({ rejections, corrections, sent: {}, now });
assert.deepEqual(rows.map((r) => r.omo), ["EQ17038", "EP19269", "EP21054", "EQ10005", "EQ10004", "EQ10001", "EQ10002"], "held (biggest first), paid, lost");
const by = Object.fromEntries(rows.map((r) => [r.omo, r]));
assert.equal(by.EQ17038.next, "paid", "mailed: waiting for HPD to pay");
assert.equal(by.EP19269.next, "fixed", "an older fix doesn't count");
assert.equal(by.EP21054.next, "emailed");
assert.equal(by.EQ10005.next, "printed", "fixed in the app (corrected package on record)");
assert.equal(by.EQ10001.status, "paid");
assert.ok(PAY_STEPS.every((s) => by.EQ10001.steps[s.key].done), "paid: every step done");
assert.equal(by.EQ10002.status, "lost");
assert.equal(summary.held, 570 + 490 + 1200 + 350);
assert.equal(summary.heldCount, 5);
assert.equal(by.EQ10004.inPip, false);
assert.equal(summary.withAmount, 4);
assert.equal(summary.notInPip, 1);
assert.equal(summary.toFix, 2);
assert.equal(summary.inTheMail, 1);
assert.equal(summary.paid, 800);
assert.equal(summary.lostCount, 1);
assert.equal(money(2610), "$2,610");
// Paperwork resent by email after the rejection counts as fixed.
const resent = trackPayments({ rejections: [rj("EP19269", "2026-09-25", "payable", 570)], corrections: [], sent: { EP19269: { sentAt: "2026-10-01" } }, now });
assert.equal(resent.rows[0].next, "printed");
console.log(`PASS payment track: ${summary.heldCount} held (${money(summary.held)}), steps from the print folder / record / PIP, old fixes don't count, paid = all steps, lost kept apart`);
