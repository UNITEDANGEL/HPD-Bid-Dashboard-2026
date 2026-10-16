// Your costs: the owner's starting numbers, a job's cost from its lines, profit and %.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { jobCost, profitAt, DEFAULT_COSTS } = await loadLib("costs");
assert.equal(DEFAULT_COSTS["door-new"].material, 500);
assert.equal(DEFAULT_COSTS.closer.material, 30);
// 2 doors: new door + hinges + closer, Brooklyn travel (an extra: price only, not cost), trip $25.
const costs = { ...DEFAULT_COSTS, trip: { material: 25, labor: 0 }, closer: { material: 30, labor: 60 } };
const lines = [{ key: "door-new", qty: 2, unit: "per door" }, { key: "hinges", qty: 2, unit: "per door" }, { key: "closer", qty: 2, unit: "per door" }, { key: "x-borough-BK", qty: 1, unit: "per job" }, { key: "lock", qty: 2, unit: "per door" }];
const c = jobCost(lines, costs);
assert.deepEqual(c, { material: 1000 + 90 + 60, labor: 120, trip: 25, total: 1295, missing: ["lock"] });
assert.deepEqual(profitAt(2000, 1295), { profit: 705, pct: 35 });
assert.deepEqual(profitAt(0, 100), { profit: -100, pct: 0 });
// Per-job lines count once whatever the quantity.
assert.equal(jobCost([{ key: "leak", qty: 3, unit: "per job" }], { leak: { material: 50, labor: 200 } }).total, 250);
console.log("PASS costs: starting numbers (door $500, closer $30, hinges 3x$15), 2-door job = $1,295 incl. labor + trip, lock listed as missing, profit $705 (35%) at $2,000, per-job lines once");
