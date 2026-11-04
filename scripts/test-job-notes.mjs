// Notes typed on a job card are kept per job, trimmed, and can be removed.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
const { addJobNote, loadJobNotes, removeJobNote } = await loadLib("job-notes");
assert.deepEqual(loadJobNotes("A1"), []);
addJobNote("A1", "  gate code   1234 ", "2026-11-04T00:00:00Z");
addJobNote("A1", "ask for Joe");
addJobNote("B2", "other job");
addJobNote("A1", "   ");
assert.deepEqual(loadJobNotes("A1").map((n) => n.text), ["gate code 1234", "ask for Joe"]);
assert.equal(loadJobNotes("B2").length, 1);
assert.deepEqual(removeJobNote("A1", 0).map((n) => n.text), ["ask for Joe"]);
store.set("hpd-job-notes", "not json");
assert.deepEqual(loadJobNotes("A1"), []);
console.log("job notes ok");
