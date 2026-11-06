// 📍 "The job here" (plan item 21): the nearest job within about 200 m of the phone, from a fresh location.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { jobHere, saysHere } = await loadLib("job-here");
const { parseCommand } = await loadLib("voice-agent");
const now = Date.now();
const spots = [{ id: "ER01720", lat: 40.713545, lng: -73.816376 }, { id: "EQ00001", lat: 40.7145, lng: -73.8164 }, { id: "EQ00002", lat: 40.75, lng: -73.9 }];
assert.deepEqual(jobHere({ lat: 40.71356, lng: -73.81636, accuracy: 15, at: now }, spots, now), { id: "ER01720", meters: 2 });
assert.equal(jobHere({ lat: 40.72, lng: -73.81, accuracy: 15, at: now }, spots, now), null, "nothing within reach");
assert.equal(jobHere({ lat: 40.713545, lng: -73.816376, accuracy: 15, at: now - 11 * 60000 }, spots, now), null, "old location");
assert.equal(jobHere(null, spots, now), null);
for (const t of ["this job", "the job here", "text the tenant for this building", "where I am"]) assert.equal(saysHere(t), true, t);
assert.equal(saysHere("the job on Main Street"), false);
assert.deepEqual(parseCommand("what job is this"), { intent: "open", ref: "", here: true });
assert.deepEqual(parseCommand("which job am I at"), { intent: "open", ref: "", here: true });
console.log("PASS the job here: nearest job within ~200 m of a fresh location; old or far = none; \"what job is this\"");
