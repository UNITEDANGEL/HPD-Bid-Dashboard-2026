// ⏱ How long each kind of work takes (app idea list): the question is understood, and answered from the timed visits.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { kindOfWork, kindTimeAnswer, kindTimes } = await loadLib("learned-time");
const { parseCommand } = await loadLib("voice-agent");

assert.deepEqual(parseCommand("how long does a door job take"), { intent: "time-kind", work: "door" });
assert.deepEqual(parseCommand("How long do locks usually take me?"), { intent: "time-kind", work: "locks" });
assert.deepEqual(parseCommand("how much time does plaster work take"), { intent: "time-kind", work: "plaster" });
assert.deepEqual(parseCommand("how long does each kind of work take"), { intent: "time-kind", work: "" });
assert.equal(parseCommand("how long do my jobs take").intent, "losing-time", "the older question keeps its answer");
assert.notEqual(parseCommand("how long does it take to drive to the door job").intent, "time-kind");
assert.notEqual(parseCommand("how long does HPD take to pay").intent, "time-kind");

const timed = [
  { building: "a", kind: "door / lock", minutes: 40 },
  { building: "b", kind: "door / lock", minutes: 55 },
  { building: "c", kind: "door / lock", minutes: 80 },
  { building: "d", kind: "plumbing", minutes: 95 },
  { building: "e", kind: "other", minutes: 30 },
];
assert.equal(kindOfWork("doors"), "door / lock");
assert.equal(kindTimeAnswer(kindOfWork("door"), timed), "⏱ Door / lock work takes you about 55 min: the middle of 3 timed jobs (from 40 min to 1 h 20 min).");
assert.equal(kindTimeAnswer(kindOfWork("leak"), timed), "⏱ Plumbing work takes you about 1 h 35 min: the middle of 1 timed job. A few more timed jobs and it gets surer.");
assert.match(kindTimeAnswer(kindOfWork("mold"), timed), /^I haven't timed a mold job yet\./);
assert.equal(kindTimeAnswer(null, timed), "⏱ How long your work takes (the middle of your timed jobs):\n• door / lock: 55 min (3 jobs)\n• plumbing: 1 h 35 min (1 job)");
assert.match(kindTimeAnswer(null, []), /^No job has been timed yet\./);
assert.equal(kindTimes(timed).length, 2, "'other' left out");
console.log("PASS time by kind: questions understood (not drive / HPD / my jobs), answered from the timed visits with the range");
