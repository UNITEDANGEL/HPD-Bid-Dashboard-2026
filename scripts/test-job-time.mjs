// Time on site: from "I'm here" to the saved outcome, same day only.
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-jt-"));
fs.writeFileSync(path.join(dir, "job-time.mjs"), ts.transpileModule(fs.readFileSync("lib/job-time.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { onSiteMinutes, minutesLabel, onSiteNote } = await import(pathToFileURL(path.join(dir, "job-time.mjs")).href);

const job = (arrived, done) => ({ FieldArrivedAt: arrived, FieldVisitHistory: done ? [{ recordedAt: done, outcome: "WORK_COMPLETED" }] : [] });
assert.equal(onSiteMinutes(job("2026-11-03T15:00:00Z", "2026-11-03T15:42:00Z")), 42);
assert.equal(onSiteMinutes(job("2026-11-03T15:00:00Z", null)), null, "no outcome yet");
assert.equal(onSiteMinutes(job("2026-11-03T15:00:00Z", "2026-11-01T16:00:00Z")), null, "past-day outcome");
assert.equal(onSiteMinutes(job("2026-11-03T12:00:00Z", "2026-11-03T22:30:00Z")), null, "over 10 hours");
assert.equal(onSiteMinutes({}), null);
assert.equal(minutesLabel(42), "42 min");
assert.equal(minutesLabel(90), "1 h 30 min");
assert.equal(minutesLabel(120), "2 h");
const a = job("2026-11-03T15:00:00Z", "2026-11-03T15:42:00Z");
assert.equal(onSiteNote(a, [a]), "⏱ 42 min on site");
const others = [30, 40, 50].map((m) => job("2026-11-02T15:00:00Z", new Date(Date.parse("2026-11-02T15:00:00Z") + m * 60000).toISOString()));
assert.equal(onSiteNote(a, [a, ...others]), "⏱ 42 min on site · your usual: 40 min");
console.log("job-time ok");
