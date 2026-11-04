// Don't leave without the after photo: only when arrived today, no outcome, no after photo, and more than 150 m away.
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-lr-"));
fs.writeFileSync(path.join(dir, "leave-reminder.mjs"), ts.transpileModule(fs.readFileSync("lib/leave-reminder.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { leftWithoutAfterPhoto } = await import(pathToFileURL(path.join(dir, "leave-reminder.mjs")).href);

const now = Date.parse("2026-11-04T18:00:00Z");
const job = { FieldArrivedAt: "2026-11-04T16:00:00Z" };
assert.equal(leftWithoutAfterPhoto(job, 0, 400, now), true);
assert.equal(leftWithoutAfterPhoto(job, 0, 50, now), false, "still at the job");
assert.equal(leftWithoutAfterPhoto(job, 2, 400, now), false, "has an after photo");
assert.equal(leftWithoutAfterPhoto({}, 0, 400, now), false, "never arrived");
assert.equal(leftWithoutAfterPhoto({ FieldArrivedAt: "2026-11-03T16:00:00Z" }, 0, 400, now), false, "arrived yesterday");
assert.equal(leftWithoutAfterPhoto({ ...job, FieldOutcome: "NO_ACCESS" }, 0, 400, now), false, "outcome saved");
assert.equal(leftWithoutAfterPhoto({ ...job, FieldVisitHistory: [{ recordedAt: "2026-11-04T17:00:00Z", outcome: "WORK_COMPLETED" }] }, 0, 400, now), false, "outcome in history");
assert.equal(leftWithoutAfterPhoto({ ...job, FieldVisitHistory: [{ recordedAt: "2026-11-01T17:00:00Z", outcome: "NO_ACCESS" }] }, 0, 400, now), true, "old outcome does not count");
console.log("leave-reminder ok");
