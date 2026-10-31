// The outcome said with its day and who refused (31 Oct, "do 1": "refused access on EQ15239 yesterday, male, tall, dark
// hair"): the day it happened (never a future day) and the description come out, and the job is still found.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseCommand } = await loadLib("voice-agent");
const { parsePastDay } = await loadLib("voice-when");
const now = new Date("2026-10-31T15:00:00Z"); // Saturday 31 Oct, 11 AM New York
const day = (s) => parsePastDay(s, now).date;
assert.equal(day("yesterday"), "2026-10-30");
assert.equal(day("the day before yesterday"), "2026-10-29");
assert.equal(day("3 days ago"), "2026-10-28");
assert.equal(day("on monday"), "2026-10-26");
assert.equal(day("saturday"), "2026-10-31", "today's weekday = today");
assert.equal(day("last saturday"), "2026-10-24");
assert.equal(day("on 10/24"), "2026-10-24");
assert.equal(day("october 24th"), "2026-10-24");
assert.equal(day("december 5"), "2025-12-05", "a month ahead is last year's");
assert.equal(day("today"), "2026-10-31");
assert.equal(day("refused access"), undefined);
// The whole command (the date relative to the real today, so only check that it is there).
const c1 = parseCommand("Refused access on EQ15239 yesterday, male, tall, dark hair");
assert.equal(c1.intent, "outcome"); assert.equal(c1.outcome, "REFUSED_ACCESS"); assert.equal(c1.ref, "EQ15239");
assert.match(c1.date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(c1.who, "male tall dark hair");
const c2 = parseCommand("the tenant refused access on 10/24 female short gray hair");
assert.equal(c2.outcome, "REFUSED_ACCESS"); assert.equal(c2.ref, ""); assert.match(c2.date, /-10-24$/); assert.equal(c2.who, "female short gray hair");
const c3 = parseCommand("no access at 707 east 189 street on monday");
assert.equal(c3.outcome, "NO_ACCESS_1_WAITING_72H"); assert.match(c3.ref, /^707 east 189/); assert.ok(c3.date); assert.equal(c3.who, undefined);
const c4 = parseCommand("refused access EQ15239 by the super");
assert.equal(c4.who, "the super"); assert.equal(c4.ref, "EQ15239"); assert.equal(c4.date, undefined);
// Said without a day or who: the same as before.
assert.deepEqual(parseCommand("I finished EQ15239"), { intent: "outcome", outcome: "WORK_COMPLETED", ref: "EQ15239" });
assert.deepEqual(parseCommand("tenant refused access"), { intent: "outcome", outcome: "REFUSED_ACCESS", ref: "" });
console.log("PASS outcome by voice with its day (yesterday, N days ago, Monday, 10/24, October 24; never ahead) and who refused; the job still found");
