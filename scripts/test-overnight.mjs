// 📬 HPD overnight in the brief (plan item 30).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { overnightLine, since5pm } = await loadLib("overnight");
const now = Date.parse("2026-11-06T08:00:00-05:00");
assert.equal(new Date(since5pm(now)).toISOString(), "2026-11-05T22:00:00.000Z", "5 PM yesterday, New York");
assert.equal(new Date(since5pm(Date.parse("2026-07-10T08:00:00-04:00"))).toISOString(), "2026-07-09T21:00:00.000Z", "summer time");
const m = (at, hpd = true) => ({ at, hpd, mine: !hpd });
const threads = [
  { subject: "24 HR POOR PERFORMANCE NOTICE- OMO#ER01720", omos: ["ER01720"], people: ["Joy-Ann Lewis"], messages: [m("2026-11-05T19:10:00-05:00")] },
  { subject: "Missing Documents", omos: ["EP04029", "EP07952", "EP17575"], people: ["Deoranie Gafur"], messages: [m("2026-11-06T07:30:00-05:00")] },
  { subject: "72 HR POOR PERFORMANCE NOTICE- OMO#ER00001", omos: ["ER00001"], people: ["Joy-Ann Lewis"], messages: [m("2026-11-05T15:00:00-05:00")] },
  { subject: "RE: ER02222", omos: ["ER02222"], people: ["Joy-Ann Lewis"], messages: [m("2026-11-05T20:00:00-05:00", false)] },
];
assert.equal(overnightLine(threads, now), "Overnight, Gafur sent documents on EP04029 and EP07952 and 1 more; Lewis sent a 24-hour notice on ER01720.");
assert.equal(overnightLine([threads[2], threads[3]], now), "", "before 5 PM, or our own email: nothing");
console.log("PASS HPD overnight: who wrote since 5 PM yesterday, on which job and what, newest first");
