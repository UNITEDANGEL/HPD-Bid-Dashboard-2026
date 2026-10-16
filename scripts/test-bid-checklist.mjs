// Morning bid checklist: today + tomorrow, state of each, best price, to-do first (soonest due), sent after.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { bidChecklist, timeLeft } = await loadLib("bid-checklist");
const today = "2026-10-16", tomorrow = "2026-10-17", now = new Date("2026-10-16T13:00:00Z"); // 9:00 AM NY
const bids = [
  { omo: "A", address: "1 A ST", bidDue: today, bidDueTime: "11:00 AM" },
  { omo: "B", address: "2 B ST", bidDue: today, bidDueTime: "10:00 AM" },
  { omo: "C", address: "3 C ST", bidDue: tomorrow, bidDueTime: "11:00 AM" },
  { omo: "D", address: "4 D ST", bidDue: today, bidDueTime: "8:30 AM" },
  { omo: "E", address: "5 E ST", bidDue: "2026-10-20", bidDueTime: "11:00 AM" },
  { omo: "F", address: "6 F ST", bidDue: today, bidDueTime: "12:00 PM" },
];
const rec = (omo, status, extra = {}) => ({ omo, address: "", bidDue: bids.find((b) => b.omo === omo).bidDue, price: 500, savedAt: "2026-10-16T12:00:00Z", status, attempts: 1, updatedAt: "2026-10-16T12:00:00Z", ...extra });
const records = { A: rec("A", "confirmed", { sentAt: "2026-10-16T12:30:00Z" }), F: rec("F", "saved") };
const c = bidChecklist(bids, records, today, tomorrow, 9 * 60, now, (o) => (o === "B" ? { best: 540, chance: 0.7 } : null), new Set(["C"]));
assert.deepEqual(c.rows.map((r) => `${r.omo}:${r.state}`), ["D:past", "B:not-priced", "F:saved", "C:not-priced", "A:confirmed"]);
assert.deepEqual(c.todo.map((r) => r.omo), ["B", "F", "C"], "to do: soonest first, past and sent left out");
assert.equal(c.sent, 1); assert.equal(c.total, 4); assert.equal(c.todayLeft, 2); assert.equal(c.missed, 1);
assert.equal(c.rows.find((r) => r.omo === "B").best, 540);
assert.equal(c.rows.find((r) => r.omo === "C").easy, true);
assert.equal(c.rows.find((r) => r.omo === "C").minutesLeft, 26 * 60, "tomorrow 11 AM is 26 hours away at 9 AM");
assert.equal(timeLeft(130), "2h 10m left"); assert.equal(timeLeft(45), "45m left"); assert.equal(timeLeft(0), "past due");
// A re-invitation: last round's sent record doesn't count for this round.
const reb = [{ omo: "R", address: "", bidDue: today, bidDueTime: "11:00 AM" }];
const old = { R: { ...rec("A", "confirmed", { sentAt: "2026-10-01T12:00:00Z" }), omo: "R", bidDue: "2026-10-02" } };
assert.equal(bidChecklist(reb, old, today, tomorrow, 9 * 60, now).rows[0].state, "not-priced");
// Deadline warnings: 45 minutes or less = send now; 10 or less = may arrive too late; sent = no warning.
const { urgency, earlyDeadline } = await loadLib("bid-checklist");
assert.equal(urgency(120, false), ""); assert.equal(urgency(45, false), "send-now"); assert.equal(urgency(10, false), "too-late");
assert.equal(urgency(30, true), ""); assert.equal(urgency(-5, false), "");
assert.equal(earlyDeadline("10:00 AM"), true); assert.equal(earlyDeadline("11:00 AM"), false); assert.equal(earlyDeadline("1:30 PM"), false);
console.log("PASS bid checklist: today + tomorrow, state, best price, to-do soonest first, past due counted, re-invitation is a new round, send-now / too-late warnings, early deadlines");
