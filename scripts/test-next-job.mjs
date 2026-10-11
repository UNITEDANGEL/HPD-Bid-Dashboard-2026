// Next job after a visit: closest open job, never the same one or a closed one.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-next-"));
fs.writeFileSync(path.join(dir, "next-job.mjs"), ts.transpileModule(fs.readFileSync("lib/next-job.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { nextJob, milesBetween, milesLabel } = await import(path.join(dir, "next-job.mjs"));

const here = { lat: 40.7105, lng: -74.0043 }; // 100 Gold St
const spots = [
  { id: "HERE", lat: 40.7105, lng: -74.0043, open: true },           // the job just finished
  { id: "CLOSED", lat: 40.7106, lng: -74.0044, open: false },        // done / archived
  { id: "NEAR", lat: 40.7128, lng: -74.0060, open: true },           // ~0.2 mi
  { id: "FAR", lat: 40.8517, lng: -73.9376, open: true },            // Washington Heights
  { id: "NOWHERE", lat: NaN, lng: NaN, open: true },                 // no location
];
assert.deepEqual(nextJob(spots, "HERE", here)?.id, "NEAR");
assert.equal(nextJob(spots.filter((s) => s.id !== "NEAR"), "HERE", here)?.id, "FAR");
assert.equal(nextJob([spots[0], spots[1]], "HERE", here), null, "nothing open nearby");
const miles = milesBetween(here, { lat: 40.8517, lng: -73.9376 });
assert.ok(miles > 10 && miles < 11, `~10.3 mi, got ${miles}`);
assert.equal(milesLabel(0.01), "same building");
assert.equal(milesLabel(0.05), "264 ft away");
assert.equal(milesLabel(1.234), "1.2 mi away");
assert.equal(milesLabel(14.6), "15 mi away");
console.log("PASS next job: closest open job, skips the finished job, closed jobs and jobs without a location");
