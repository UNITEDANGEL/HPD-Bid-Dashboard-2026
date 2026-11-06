// 🚗 "I'm on my way" with the arrival time (plan item 27).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { isOnMyWay, etaMinutes, withArrival } = await loadLib("on-my-way");
for (const t of ["I'm on my way", "we are on the way", "heading over now", "leaving now"]) assert.equal(isOnMyWay(t), true, t);
assert.equal(isOnMyWay("see you Thursday"), false);
const here = { lat: 40.7135, lng: -73.8164 }, there = { lat: 40.7425, lng: -73.8164 }; // ~2 miles north
const sunday = new Date("2026-11-08T17:00:00Z"); // Sunday noon in New York
assert.equal(etaMinutes(here, there, sunday), 9, "2 mi x 1.35 at 18 mph");
const rush = new Date("2026-11-09T22:00:00Z"); // Monday 5 PM
assert.equal(etaMinutes(here, there, rush), 14, "rush hour: 12 mph");
assert.equal(withArrival("I'm on my way", 9, new Date("2026-11-08T17:31:00Z")), "I'm on my way. I should be there around 12:40 PM.");
assert.equal(etaMinutes(here, here, sunday), 3, "at least 3 minutes");
console.log("PASS on my way: arrival time from the distance and the traffic, rounded up to 5 minutes");

// 📸 Photos before paperwork (plan item 28).
{
  const { photoGap } = await loadLib("paperwork-photos");
  assert.match(photoGap("WORK_COMPLETED", { before: 0, after: 0 }), /^📸 No before or after photos on this phone yet\. HPD needs them/);
  assert.match(photoGap("PARTIAL_WORK_COMPLETED", { before: 3, after: 0 }), /^📸 No after photos/);
  assert.match(photoGap("WORK_COMPLETED", { before: 0, after: 2 }), /^📸 No before photos/);
  assert.equal(photoGap("WORK_COMPLETED", { before: 2, after: 2 }), "");
  assert.equal(photoGap("REFUSED_ACCESS", { before: 0, after: 0 }), "", "no work done: no before / after needed");
  console.log("PASS photos before paperwork: says what's missing when the work was done");
}
