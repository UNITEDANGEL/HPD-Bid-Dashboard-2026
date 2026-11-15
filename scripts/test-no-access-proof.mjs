import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const src = readFileSync("lib/no-access-proof.ts", "utf8");
const dir = mkdtempSync(join(tmpdir(), "nap-"));
const file = join(dir, "m.mjs");
writeFileSync(file, ts.transpileModule(src, { compilerOptions: { module: "ES2020", target: "ES2020" } }).outputText);
const { noAccessProofNote } = await import(pathToFileURL(file).href);
const t = new Date("2026-11-14T15:30:00Z");
assert.equal(noAccessProofNote({ at: t, photos: 2, callTries: 3 }), "No access proof: Nov 14, 10:30 AM, 2 door photos, 3 call tries.");
assert.equal(noAccessProofNote({ at: t, photos: 1, callTries: 1 }), "No access proof: Nov 14, 10:30 AM, 1 door photo, 1 call try.");
assert.equal(noAccessProofNote({ at: t, photos: 0 }), "No access proof: Nov 14, 10:30 AM, no door photo, 0 call tries.");
console.log("no-access-proof ok");
const m2 = await import(pathToFileURL(file).href);
assert.ok(m2.noShowSmsHref("(917) 555-0100", "12 Main St").startsWith("sms:9175550100?&body=Hello"));
assert.equal(m2.noShowSmsHref("", "x"), "");
assert.equal(m2.noShowWait(0, 125000), "2:05");
console.log("no-show ok");
// Second try after no access: 3 calendar days later, never a weekend.
assert.equal(m2.secondTryDay(new Date("2026-11-09T15:00:00Z")), "2026-11-12"); // Mon -> Thu
assert.equal(m2.secondTryDay(new Date("2026-11-12T15:00:00Z")), "2026-11-16"); // Thu -> Sun -> Mon
assert.equal(m2.secondTryDay(new Date("2026-11-13T15:00:00Z")), "2026-11-16"); // Fri -> Mon
assert.equal(m2.secondTryDay(new Date("2026-11-14T15:00:00Z")), "2026-11-17"); // Sat -> Tue
assert.equal(m2.secondTryNote("2026-11-16"), "Second try planned for Monday, November 16.");
assert.match(m2.secondTryText("12 Main St", "2026-11-16"), /12 Main St\. We could not get in today\. We will come again on Monday, November 16\./);
assert.ok(m2.secondTrySmsHref("(917) 555-0100", "12 Main St", "2026-11-16").startsWith("sms:9175550100?&body=Hello"));
assert.equal(m2.secondTrySmsHref("", "x", "2026-11-16"), "");
console.log("second-try ok");
