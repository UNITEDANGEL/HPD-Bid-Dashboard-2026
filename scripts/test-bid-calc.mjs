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
console.log("PASS bid calculator: 40 sq ft x $15 + leak, 5th floor = 3 floors up, 2 locations, Brooklyn travel, a line changed for this job, +10%");
