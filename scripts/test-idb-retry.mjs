// lib/idb-retry: a read that fails with iPhone Safari's lost-database error is tried once more; other errors are not.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { idbRetry, isTransientIdbError } = await loadLib("idb-retry");
const lost = Object.assign(new Error("Attempt to get records from database without an in-progress transaction"), { name: "UnknownError" });
assert.equal(isTransientIdbError(lost), true);
assert.equal(isTransientIdbError(new TypeError("x is undefined")), false);
let n = 0;
assert.deepEqual(await idbRetry(async () => { if (n++ === 0) throw lost; return ["ok"]; }), ["ok"]);
assert.equal(n, 2, "tried twice");
n = 0;
await assert.rejects(idbRetry(async () => { n++; throw new TypeError("bug"); }), /bug/);
assert.equal(n, 1, "a real bug is not retried");
n = 0;
await assert.rejects(idbRetry(async () => { n++; throw lost; }), /in-progress/);
assert.equal(n, 2, "gives up after one more try");
console.log("PASS idb retry: the lost-database error is tried once more; real bugs are not");
