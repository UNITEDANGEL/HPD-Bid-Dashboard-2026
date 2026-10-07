// Test first, then everyone: a TEST_FIRST upgrade is on for TEST-0001 only; a LIVE one for all.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-rollout-"));
const compile = (file, swaps = (t) => t) => swaps(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
fs.writeFileSync(path.join(dir, "test-job.mjs"), compile("lib/test-job.ts"));
fs.writeFileSync(path.join(dir, "rollout.mjs"), compile("lib/rollout.ts", (t) => t.replace('"./test-job"', '"./test-job.mjs"')));
const rollout = await import(path.join(dir, "rollout.mjs"));

rollout.TEST_FIRST["new-thing"] = "Sample upgrade";
assert.equal(rollout.upgradeOn("new-thing", "TEST-0001"), true);
assert.equal(rollout.upgradeOn("new-thing", "test-0001"), true);
assert.equal(rollout.upgradeOn("new-thing", "ER05729"), false);
assert.equal(rollout.upgradeOn("unknown", "TEST-0001"), false);
delete rollout.TEST_FIRST["new-thing"];
rollout.LIVE.add("new-thing");
assert.equal(rollout.upgradeOn("new-thing", "ER05729"), true);
assert.ok(!rollout.testFirstUpgrades().some((u) => u.name === "new-thing"), "a live upgrade is no longer listed as test-first");
// Every test-first upgrade is described for the test job's card.
assert.ok(rollout.testFirstUpgrades().every((u) => u.name && u.about));
console.log("PASS rollout: test-first upgrades only on TEST-0001; live upgrades on every job");
