// Payment tracker (owner, 31 Oct "do 6"): every job sent to HPD until PIP shows it paid. Late = PIP still shows it
// open after 90 days; a job sent after PIP's last download, or one PIP's download doesn't list, is never called late;
// what each should bring in: PIP's open amount, else the award (work) or the $100 / $300 service charge (no work).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { paymentWaits, TOO_LONG_DAYS } = await loadLib("pay-waiting");
const now = Date.parse("2026-10-31T16:00:00Z");
const out = paymentWaits({
  now, pipAsOf: "2026-10-15T01:22:52Z",
  sent: {
    LATE1: { sentAt: "2026-06-01" },   // open in PIP after 152 days: late
    OPEN1: { sentAt: "2026-09-20" },   // open in PIP, 41 days: waiting, not late
    PAID1: { sentAt: "2026-08-01" },   // paid 10/09: paid recently
    OLDPAID: { sentAt: "2026-03-01" }, // paid in June: done, not listed
    NOPIP: { sentAt: "2026-05-01" },   // not in PIP's download: unknown, not late
    AFTER: { sentAt: "2026-10-20" },   // sent after PIP's download
    ANCIENT: { sentAt: "2025-01-02" }, // over a year ago: not listed
  },
  emailed: { APP1: "2026-10-28T15:00:00Z", OPEN1: "2026-09-25T12:00:00Z" },
  pip: {
    LATE1: { status: "not paid yet", paid: 0, outstanding: 1250, lastDate: "2026-06-03" },
    OPEN1: { status: "not paid yet", paid: 0, outstanding: 0 },
    PAID1: { status: "paid", paid: 775, outstanding: 0, lastDate: "2026-10-09" },
    OLDPAID: { status: "paid", paid: 500, outstanding: 0, lastDate: "2026-06-10" },
  },
  jobs: { LATE1: { address: "12 MAIN ST", award: 1250 }, OPEN1: { address: "40 PARK PL", award: 2400 }, NOPIP: { award: 900, outcome: "WORK_COMPLETED" }, AFTER: { award: 2500 }, APP1: { award: 650, outcome: "REFUSED_ACCESS" } },
  closedReason: { OPEN1: "No Access" },
});
const by = Object.fromEntries(out.rows.map((r) => [r.omo, r]));
assert.deepEqual(Object.keys(by).sort(), ["AFTER", "APP1", "LATE1", "NOPIP", "OPEN1", "PAID1"]);
assert.equal(out.rows[0].omo, "LATE1", "late first");
assert.equal(by.LATE1.tooLong, true); assert.equal(by.LATE1.days, 152); assert.equal(by.LATE1.amount, 1250); assert.equal(by.LATE1.estimated, false);
assert.equal(by.OPEN1.sentAt, "2026-09-25", "the latest send (the app's email after the Sent-mail one)");
assert.equal(by.OPEN1.tooLong, false);
assert.equal(by.OPEN1.amount, 300, "no access on a $2,400 job: the $300 service charge (PIP has no number)");
assert.equal(by.OPEN1.estimated, true);
assert.equal(by.PAID1.status, "paid"); assert.equal(by.PAID1.amount, 775); assert.equal(by.PAID1.paidAt, "2026-10-09");
assert.equal(by.NOPIP.status, "not-in-pip"); assert.equal(by.NOPIP.tooLong, false, "not in PIP's download: unknown, not late"); assert.equal(by.NOPIP.amount, 900);
assert.equal(by.AFTER.status, "after-pip"); assert.equal(by.AFTER.amount, 2500);
assert.equal(by.APP1.status, "after-pip", "emailed from the app only"); assert.equal(by.APP1.amount, 100, "refused access under $2,000: $100");
assert.deepEqual(out.summary, { waiting: 5, waitingAmount: 1250 + 300 + 900 + 2500 + 100, tooLong: 1, tooLongAmount: 1250, afterPip: 2, notInPip: 1, paid: 1, paidAmount: 775 });
assert.equal(TOO_LONG_DAYS, 90);
console.log("PASS payment tracker: late = open in PIP after 90 days (first), newest send counts, paid in the last 30 days, not-in-PIP / after PIP's download never late, amounts from PIP or award / service charge");
