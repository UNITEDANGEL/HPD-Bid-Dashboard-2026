// End-of-day summary: today's visits and outcomes, jobs to close out, and tomorrow's appointments
// and 2nd tries, in New York time.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hpd-sum-"));
const compile = (src) => ts.transpileModule(fs.readFileSync(src, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from "\.\/(field-next-action|appointments)"/g, 'from "./$1.mjs"');
for (const name of ["day-summary", "field-next-action", "appointments"]) fs.writeFileSync(path.join(dir, `${name}.mjs`), compile(`lib/${name}.ts`));
const { daySummary } = await import(path.join(dir, "day-summary.mjs"));

// "Now": Tue Oct 6 2026, 6:00 PM New York (22:00 UTC).
const now = new Date("2026-10-06T22:00:00Z");
const at = (ny) => new Date(`2026-10-06T${ny}:00-04:00`).toISOString();
const jobs = [
  { OMO: "ER1", Address: "1 MAIN ST", FieldArrivedAt: at("09:14"), FieldOutcome: "WORK_COMPLETED",
    FieldVisitHistory: [{ recordedAt: at("09:14"), outcome: null, note: "Arrived", feetFromJob: 36 }, { recordedAt: at("11:02"), outcome: "WORK_COMPLETED", note: "" }] },
  { OMO: "ER2", Address: "2 OAK AVE", FieldArrivedAt: at("12:30"), FieldOutcome: "NO_ACCESS_1_WAITING_72H", NoAccessFirstAttemptAt: at("12:40"),
    FieldVisitHistory: [{ recordedAt: at("12:40"), outcome: "NO_ACCESS_1_WAITING_72H", note: "" }] },
  { OMO: "ER3", Address: "3 ELM PL", Appointment: { date: "2026-10-07", start: "10:00", end: "11:00", state: "confirmed", contact: "T", phone: "", note: "", reminder: 60 },
    AppointmentHistory: [{ date: "2026-10-07", start: "10:00", end: "11:00", state: "confirmed", updatedAt: at("14:00") }], FieldOutcome: "APPOINTMENT_CONFIRMED" },
  { OMO: "ER4", Address: "4 PINE RD", FieldOutcome: "NO_ACCESS_1_WAITING_72H", NoAccessFirstAttemptAt: "2026-10-03T14:00:00Z",
    FieldVisitHistory: [{ recordedAt: "2026-10-03T14:00:00Z", outcome: "NO_ACCESS_1_WAITING_72H" }] },
  { OMO: "ER5", Address: "5 BAY ST", FieldOutcome: "REFUSED_ACCESS", PackageEmailedAt: at("16:00"), PackageApprovedAt: at("16:00"), PackageReviewStatus: "Approved" },
  { OMO: "ER6", Address: "6 OLD RD", FieldOutcome: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: "2026-09-30T14:00:00Z", outcome: "WORK_COMPLETED" }] },
  { OMO: "ER7", Address: "7 NEW ST" },
];
const s = daySummary(jobs, { id: (j) => j.OMO, address: (j) => j.Address }, now);
assert.equal(s.dayLabel, "Tue 10/06");
assert.deepEqual(s.counts, { visited: 2, finished: 1, noAccess: 1, refused: 0, booked: 1, emailed: 1, closeOut: 2 });
assert.deepEqual(s.visited.map((r) => r.id), ["ER1", "ER2", "ER3", "ER5"], "in the order things happened (9:14, 12:30, 2:00, 4:00)");
assert.equal(s.visited[0].text, "arrived 9:14 AM (36 ft from the building) · Work completed");
assert.equal(s.visited[1].text, "arrived 12:30 PM · No access · 2nd try from Fri 10/09");
assert.equal(s.visited[2].text, "appointment booked for Wed 10/07 · 10–11 AM");
assert.equal(s.visited[3].text, "package emailed");
assert.deepEqual(s.closeOut.map((r) => r.id), ["ER1", "ER6"], "finished, not approved; waiting 2nd tries and appointments aren't close-outs");
assert.deepEqual(s.tomorrow.map((r) => `${r.id} ${r.text}`), ["ER3 📅 appointment Wed 10/07 · 10–11 AM", "ER4 🔒 2nd try (no access) due now"]);
assert.match(s.text, /^HPD field summary · Tue 10\/06\n\nVisited 2 · finished 1 · no access 1/);
assert.match(s.text, /TOMORROW · Wed 10\/07 \(2\)/);
assert.match(s.text, /READY TO CLOSE OUT \(2\)/);
assert.doesNotMatch(s.text, /ER7/, "untouched jobs aren't listed");
assert.deepEqual(daySummary([...jobs].reverse(), { id: (j) => j.OMO, address: (j) => j.Address }, now).visited.map((r) => r.id), ["ER1", "ER2", "ER3", "ER5"], "order comes from the times, not the list");
const empty = daySummary([], { id: (j) => j.OMO, address: (j) => j.Address }, now);
assert.match(empty.text, /- nothing recorded today[^]*- none[^]*- nothing due/);
fs.rmSync(dir, { recursive: true, force: true });
console.log("PASS day summary: today's visits (arrival time, distance, outcome, 2nd-try date, bookings, emails), close-outs, tomorrow");
