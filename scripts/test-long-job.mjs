// ⏰ Job is taking long: usual time (learned, else your middle visit, else 1 h); long = 1.5x and 20+ min over.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { usualMinutes, takingLong, nextOpenStop } = await loadLib("long-job");
assert.equal(usualMinutes(80, []), 80);
assert.equal(usualMinutes(null, [30, 50, 40]), 40);
assert.equal(usualMinutes(null, [30, 50]), 60);
const now = Date.parse("2026-11-09T16:00:00Z");
const ago = (m) => new Date(now - m * 60000).toISOString();
assert.equal(takingLong(ago(85), 60, now), null, "85 of 60: not yet");
assert.deepEqual(takingLong(ago(90), 60, now), { elapsed: 90, usual: 60 });
assert.deepEqual(takingLong(ago(40), 20, now), { elapsed: 40, usual: 20 }, "40 of 20: twice and 20 over");
assert.equal(takingLong(ago(39), 20, now), null);
assert.equal(takingLong(ago(700), 60, now), null, "a stale arrival");
assert.equal(takingLong("", 60, now), null);
assert.equal(nextOpenStop(["a", "b", "c", "d"], "b", (id) => id !== "c"), "d");
assert.equal(nextOpenStop(["a", "b"], "b", () => true), "");
assert.equal(nextOpenStop(["a", "b"], "x", () => true), "a", "not on the route: the first open stop");
console.log("PASS long job: usual time, 1.5x and 20 min over, the next open stop");
