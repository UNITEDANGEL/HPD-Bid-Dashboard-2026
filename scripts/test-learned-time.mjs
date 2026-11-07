// 🗺 The route that learns: a building you've been to gets the time it took there; else your usual for that kind of
// work (3+ timed jobs); else the route's minutes per job. The day plan and stop times use it.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { kindOfWork, learnedMinutes } = await loadLib("learned-time");
const { scheduleStops, planDay, stayMinutes } = await loadLib("day-route");
assert.equal(kindOfWork("Replace apartment entrance door lock cylinder"), "door / lock");
assert.equal(kindOfWork("Repair leak under kitchen sink"), "plumbing");
assert.equal(kindOfWork("Lead-based paint abatement, window sill"), "lead");
assert.equal(kindOfWork("Something else"), "other");
const timed = [
  { building: "100 WEST 125 STREET", kind: "plumbing", minutes: 95 },
  { building: "100 WEST 125 STREET", kind: "door / lock", minutes: 70 },
  { building: "1 MAIN STREET", kind: "door / lock", minutes: 40 },
  { building: "2 MAIN STREET", kind: "door / lock", minutes: 52 },
  { building: "3 MAIN STREET", kind: "door / lock", minutes: 61 },
  { building: "4 MAIN STREET", kind: "mold", minutes: 200 },
];
assert.deepEqual(learnedMinutes({ building: "100 WEST 125 STREET", kind: "other" }, timed), { minutes: 85, why: "2 visits at this building" });
assert.deepEqual(learnedMinutes({ building: "1 MAIN STREET", kind: "plumbing" }, timed), { minutes: 40, why: "your last visit at this building" });
assert.deepEqual(learnedMinutes({ building: "9 NEW STREET", kind: "door / lock" }, timed), { minutes: 55, why: "your usual for door / lock work (4 jobs)" });
assert.equal(learnedMinutes({ building: "9 NEW STREET", kind: "mold" }, timed), null, "one mold job is not enough");
assert.equal(learnedMinutes({ building: "", kind: "other" }, timed), null);
assert.equal(learnedMinutes({ building: "5 X", kind: "x" }, [{ building: "5 X", kind: "x", minutes: 3 }]).minutes, 15, "never under 15");
assert.equal(stayMinutes({}, 45), 45); assert.equal(stayMinutes({ minutes: 90 }, 45), 90);
// The stop times use the learned stay.
const s = { date: "2026-11-09", start: "08:00", end: "17:00", minutes: 45, borough: "ALL" };
const o = { lat: 40.7, lng: -73.9 };
const job = (id, extra = {}) => ({ id, address: id, borough: "BK", ...o, days: 10, pending: true, closed: false, ...extra });
const stops = scheduleStops([job("a", { minutes: 120 }), job("b")], s, o, [10, 10]);
assert.equal(stops[0].finish - stops[0].arrival, 120);
assert.equal(stops[1].finish - stops[1].arrival, 45);
// A long building fills the day: fewer stops fit.
assert.equal(planDay(Array.from({ length: 8 }, (_, i) => job(`j${i}`, { minutes: 240 })), s, o).length, 2);
assert.equal(planDay(Array.from({ length: 8 }, (_, i) => job(`j${i}`)), s, o).length, 8);
console.log("PASS learned time: building first, then kind of work (3+), else minutes per job; the route's stops use it");
