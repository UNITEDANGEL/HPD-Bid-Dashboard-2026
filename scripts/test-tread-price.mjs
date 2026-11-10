// 🪜 Price per stair tread from past awards (lib/tread-price.ts): counts read from HPD's wording, the kind's middle
// rate × this job's treads; too few awards -> no line. Then on the real award data.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const src = fs.readFileSync(new URL("../lib/tread-price.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} };
new Function("module", "exports", "require", js)(m, m.exports, createRequire(import.meta.url));
const { treadCount, treadKind, treadRate, treadLine } = m.exports;
assert.equal(treadCount("REPLACE BROKEN MARBLE STAIR TREAD ... TOTAL TREADS = (4)"), 4);
assert.equal(treadCount("INSTALL (2) NEW METAL TREADS AT 3RD FLOOR"), 2);
assert.equal(treadCount("REPAIR 3 STAIR TREADS"), 3);
assert.equal(treadCount("REPAIR STAIR TREADS AS NEEDED"), 0);
assert.equal(treadCount("REPAIR DOOR"), 0);
assert.equal(treadKind("marble tread"), "marble");
assert.equal(treadKind("diamond plate steel tread"), "metal");
const hist = [
  { amount: 1600, description: "MARBLE TREAD TOTAL TREADS = (4)" }, // 400
  { amount: 1000, description: "MARBLE TREAD TOTAL TREADS = (2)" }, // 500
  { amount: 450, description: "MARBLE TREAD TOTAL TREADS = (1)" }, // 450
  { amount: 900, description: "WOOD TREAD TOTAL TREADS = (3)" },
  { amount: 800, description: "MARBLE TREAD AS NEEDED" },
];
const r = treadRate("REPLACE CRACKED MARBLE TREAD. TOTAL TREADS = (3)", hist);
assert.deepEqual(r, { count: 3, kind: "marble", rate: 450, total: 1350, from: 3, ownKind: true });
assert.equal(treadLine(r), "🪜 ≈ $450 a marble tread (middle of 3 awards) × 3 = $1,350");
const w = treadRate("WOOD TREAD TOTAL TREADS = (2)", hist);
assert.equal(w.ownKind, false, "too few wood: all kinds");
assert.match(treadLine(w), /^🪜 ≈ \$\d+ a tread \(middle of 4 awards, all kinds\) × 2 = /);
assert.equal(treadRate("REPAIR STAIR TREADS AS NEEDED", hist), null);
assert.equal(treadRate("MARBLE TREAD TOTAL TREADS = (2)", hist.slice(0, 2)), null, "too few awards");
// The real award data.
const market = JSON.parse(fs.readFileSync(new URL("../public/data/market_awards.json", import.meta.url), "utf8")).jobs;
const real = treadRate("REPLACE BROKEN MARBLE TREAD AT 2ND FLOOR. TOTAL TREADS = (2)", market);
assert.ok(real && real.rate > 100 && real.rate < 2000, JSON.stringify(real));
console.log(`PASS tread price: counts from HPD's wording, middle rate per kind × treads; real data: ${treadLine(real)}`);
