// One job on / off Today's route by voice (30 Oct): the job named (number or address) or the one on screen; "plan my
// day", bid prices and "go to" still mean what they did.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseCommand } = await loadLib("voice-agent");
const cases = [
  ["add this job to my route", "route-add", ""],
  ["Put EQ15239 on today's route.", "route-add", "EQ15239"],
  ["add EQ 15239 to my route", "route-add", "EQ15239"],
  ["add 1207 1st avenue to the route", "route-add", "1207 1st avenue"],
  ["put it on my route for today", "route-add", ""],
  ["take it off my route", "route-remove", ""],
  ["remove EQ15239 from today's route", "route-remove", "EQ15239"],
];
for (const [said, intent, ref] of cases) assert.deepEqual(parseCommand(said), { intent, ref }, said);
assert.equal(parseCommand("plan my day").intent, "plan");
assert.equal(parseCommand("build my route").intent, "plan");
assert.equal(parseCommand("put 450 on this").intent, "bid-price");
assert.equal(parseCommand("go to EQ15239").intent, "navigate");
console.log(`PASS route by voice: ${cases.length} ways to add / take off a job; plan my day, bid price and go to unchanged`);
