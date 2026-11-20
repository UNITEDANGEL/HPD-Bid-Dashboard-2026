// 💵 Today's money: finished jobs' award amounts today and since Monday (New York), the answer in words.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { dayMoney, dayMoneyAnswer, mondayOf } = await loadLib("day-money");
const { parseCommand } = await loadLib("voice-agent");
assert.equal(mondayOf("2026-11-09"), "2026-11-09");
assert.equal(mondayOf("2026-11-15"), "2026-11-09");
assert.equal(mondayOf("2026-11-11"), "2026-11-09");
const now = new Date("2026-11-11T20:00:00Z"); // Wednesday 3 PM New York
const jobs = [
  { id: "ER1", amount: 1200, outcome: "WORK_COMPLETED", doneAt: "2026-11-11T15:00:00Z", address: "1 MAIN ST, 10001" },
  { id: "ER2", amount: 440.4, outcome: "PARTIAL_WORK", doneAt: "2026-11-11T18:00:00Z" },
  { id: "ER3", amount: 900, outcome: "WORK_COMPLETED", doneAt: "2026-11-09T14:00:00Z" },
  { id: "ER4", amount: 700, outcome: "WORK_COMPLETED", doneAt: "2026-11-08T14:00:00Z" }, // last Sunday
  { id: "ER5", amount: 500, outcome: "NO_ACCESS_1_WAITING_72H", doneAt: "2026-11-11T16:00:00Z" },
  { id: "ER6", amount: 300, outcome: "WORK_COMPLETED", doneAt: "2026-11-12T03:30:00Z" }, // Wed 10:30 PM NY
  { id: "ER7", amount: 250, outcome: "REFUSED_ACCESS", doneAt: "2026-11-11T19:00:00Z" }, // closed today: counts (20 Nov)
];
const m = dayMoney(jobs, now);
assert.equal(m.today, 2190);
assert.equal(m.week, 3090);
assert.equal(dayMoneyAnswer(m), "💵 $2,190 earned today (4 jobs closed); $3,090 this week (5 jobs).\n• ER1 · 1 MAIN ST: $1,200\n• ER2: $440\n• ER6: $300\n• ER7: $250\nHPD pays after the paperwork is approved.");
assert.match(dayMoneyAnswer(dayMoney([], now)), /^💵 No jobs closed this week yet\./);
assert.equal(parseCommand("how much did I make today").intent, "day-money");
assert.equal(parseCommand("what did I earn this week").intent, "day-money");
console.log("PASS day money: today and this week (Monday on, New York) from finished jobs; no-access not counted, refused access counted; the answer lists today's jobs");
// 20 Nov (owner: "count all the closed jobs, including the no access, refused ... that I closed out today and sent for
// payment"): the names the app really saves, a 2nd no-access try, and paperwork sent today all count today.
const real = dayMoney([
  { id: "A1", amount: 100, outcome: "COMPLETED_BY_OTHERS", doneAt: "2026-11-11T15:00:00Z" },
  { id: "A2", amount: 100, outcome: "PARTIAL_WORK_COMPLETED", doneAt: "2026-11-11T15:00:00Z" },
  { id: "A3", amount: 100, outcome: "NO_ACCESS_2_COMPLETE", doneAt: "2026-11-11T15:00:00Z" },
  { id: "A4", amount: 100, outcome: "NO_ACCESS_1_WAITING_72H", doneAt: "2026-11-08T15:00:00Z", secondTryAt: "2026-11-11T14:00:00Z" },
  { id: "A5", amount: 100, outcome: "WORK_COMPLETED", doneAt: "2026-11-05T15:00:00Z", sentAt: "2026-11-11T16:00:00Z" }, // done last week, sent today
  { id: "A6", amount: 100, outcome: "NO_ACCESS_1_WAITING_72H", doneAt: "2026-11-11T15:00:00Z" }, // 1st try only: not closed
  { id: "A7", amount: 100, outcome: "REFUSED_ACCESS", doneAt: "2026-11-10T15:00:00Z", sentAt: "2026-11-11T17:00:00Z" },
  { id: "A8", amount: 100, outcome: "", doneAt: "", sentAt: "2026-11-11T18:00:00Z" }, // sent for payment, no outcome saved in the app
  { id: "A9", amount: 100, outcome: "", doneAt: "", sentAt: "" }, // nothing: not closed
], now);
assert.deepEqual(real.todayJobs.map((j) => j.id), ["A1", "A2", "A3", "A4", "A5", "A7", "A8"]);
assert.equal(real.today, 700);
console.log("PASS day money: done by others, partial, 2nd no-access try and paperwork sent today all count today; a 1st no-access try doesn't");
// The year / month questions keep their own answer (the money report), not the chip's today / week.
for (const q of ["how much did I make this year", "how much did I make this month", "how much have I earned so far"]) assert.notEqual(parseCommand(q).intent, "day-money", q);
console.log("PASS day money: year / month questions not taken");
