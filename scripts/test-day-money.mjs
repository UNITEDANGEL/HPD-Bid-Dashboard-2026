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
];
const m = dayMoney(jobs, now);
assert.equal(m.today, 1940);
assert.equal(m.week, 2840);
assert.equal(dayMoneyAnswer(m), "💵 $1,940 earned today (3 jobs finished); $2,840 this week (4 jobs).\n• ER1 · 1 MAIN ST: $1,200\n• ER2: $440\n• ER6: $300\nHPD pays after the paperwork is approved.");
assert.match(dayMoneyAnswer(dayMoney([], now)), /^💵 No jobs finished this week yet\./);
assert.equal(parseCommand("how much did I make today").intent, "day-money");
assert.equal(parseCommand("what did I earn this week").intent, "day-money");
console.log("PASS day money: today and this week (Monday on, New York) from finished jobs; no-access not counted; the answer lists today's jobs");
// The year / month questions keep their own answer (the money report), not the chip's today / week.
for (const q of ["how much did I make this year", "how much did I make this month", "how much have I earned so far"]) assert.notEqual(parseCommand(q).intent, "day-money", q);
console.log("PASS day money: year / month questions not taken");
