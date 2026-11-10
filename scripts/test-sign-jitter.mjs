// ✍️ Signature placement a little different per job (lib/sign-jitter.ts): small (±6 pt, ±3 pt, ±2.5°, 92-106%), the
// same each time a job's copy is made again, different between jobs and between the affidavit and the invoice.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const src = fs.readFileSync(new URL("../lib/sign-jitter.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, createRequire(import.meta.url));
const { signJitter } = m.exports;
const jobs = ["ER05228", "ER04312", "EQ15239", "ER00460", "EQ30935", "ER01919", "ER07717", "EP27382"];
const all = jobs.flatMap((j) => [signJitter(j, "affidavit"), signJitter(j, "invoice")]);
for (const j of all) {
  assert.ok(Math.abs(j.dx) <= 6 && Math.abs(j.dy) <= 3 && Math.abs(j.rotate) <= 2.5 && j.scale >= 0.92 && j.scale <= 1.06 && Math.abs(j.skew) <= 3 && j.stretch >= 0.94 && j.stretch <= 1.06, JSON.stringify(j));
}
assert.deepEqual(signJitter("ER05228", "invoice"), signJitter("er05228", "invoice"), "same job, same copy");
assert.equal(new Set(all.map((j) => JSON.stringify(j))).size, all.length, "every page different");
console.log(`PASS signature placement: small and different on every job / page, the same when a copy is made again (e.g. ER05228 invoice ${JSON.stringify(signJitter("ER05228", "invoice"))})`);
