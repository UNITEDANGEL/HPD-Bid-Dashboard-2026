// Bid calculator: each line at your rate, extras from the description (floors up, more locations, borough),
// a line changed for this job only, the total moved by a percent.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { jobSummary } = await loadLib("job-summary");
const { calcContext, calcPrice } = await loadLib("bid-calc");
const desc = "AT APT 5D 5TH FLOOR KITCHEN AND BATHROOM: REMOVE AND REPLACE DEFECTIVE CERAMIC FLOOR TILES APPROX 40 SQ FT. TRACE AND REPAIR LEAK.";
const s = jobSummary(desc);
const ctx = calcContext(s, 1, "BK");
assert.deepEqual(ctx, { floor: 5, locations: 2, borough: "BK" });
let c = calcPrice(s, { floor: 15, leak: 450 }, ctx);
assert.equal(c.lines.find((l) => l.key === "floor").amount, 600, "40 sq ft x $15");
assert.equal(c.lines.find((l) => l.key === "leak").amount, 450);
assert.ok(c.lines.find((l) => l.key === "x-floor").label.includes("5th floor: 3 above the 2nd"));
assert.equal(c.total, 1050, "extras without a rate add nothing");
assert.equal(c.complete, true);
c = calcPrice(s, { floor: 15, leak: 450, "x-floor": 25, "x-location": 100, "x-borough-BK": 50 }, ctx);
assert.equal(c.total, 600 + 450 + 75 + 100 + 50);
c = calcPrice(s, { floor: 15, leak: 450 }, ctx, { leak: 700 }, 10);
assert.equal(c.lines.find((l) => l.key === "leak").overridden, true);
assert.equal(c.total, Math.round((600 + 700) * 1.1), "this job's change + 10%");
assert.equal(calcPrice(s, { floor: 15 }, ctx).complete, false, "a work line without a rate");
// Floors from the building facts: elevator = no stairs; walk-up: apartment 5A = 5th floor; roof = top floor.
const walk = (floors) => ({ floors, kind: "walk-up", description: "" });
assert.deepEqual(calcContext(s, 1, "BK", { floors: 6, kind: "elevator building", description: desc }), { floor: 0, locations: 2, borough: "BK", floorWhy: "elevator building: no stairs to carry up" });
assert.equal(calcPrice(s, { floor: 15, leak: 450, "x-floor": 25 }, calcContext(s, 1, "BK", { floors: 6, kind: "elevator building", description: desc })).lines.some((l) => l.key === "x-floor"), false, "no stairs line in an elevator building");
assert.equal(calcContext(s, 1, "BK", walk(6)).floor, 5, "a floor named by HPD stays");
const d2 = "APT 5A BATHROOM: TRACE AND REPAIR LEAK.";
const s2 = jobSummary(d2);
let x = calcContext(s2, 1, "MN", { ...walk(6), description: d2 });
assert.deepEqual([x.floor, x.floorWhy], [5, "apartment 5A: 5th floor of a 6-floor walk-up"]);
assert.ok(calcPrice(s2, { leak: 450, "x-floor": 25 }, x).lines.find((l) => l.key === "x-floor").label.includes("apartment 5A: 5th floor of a 6-floor walk-up: 3 above the 2nd"));
assert.equal(calcContext(s2, 1, "MN", { ...walk(4), description: d2 }).floor, 0, "5A in a 4-floor building: not a floor number");
assert.equal(calcContext(s2, 1, "MN", { floors: 6, kind: "one-family house", description: d2 }).floor, 0, "not a walk-up: nothing guessed");
const d3 = "ROOF: REPAIR DEFECTIVE ROOF BULKHEAD DOOR.";
x = calcContext(jobSummary(d3), 1, "BX", { ...walk(5), description: d3 });
assert.deepEqual([x.floor, x.floorWhy], [5, "roof of a 5-floor walk-up"]);
assert.equal(calcContext(s2, 1, "MN", null).floor, 0, "no building facts: as before");
console.log("PASS bid calculator: 40 sq ft x $15 + leak, 5th floor = 3 floors up, 2 locations, Brooklyn travel, a line changed for this job, +10%; floors from the building: elevator no stairs, apt 5A of a 6-floor walk-up, roof = top floor");
