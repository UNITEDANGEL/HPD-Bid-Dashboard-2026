// 🧭 Next stop after a job (plan item 31).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { nextStop, nextStopLine, workInWords } = await loadLib("next-stop");
const here = { lat: 40.683503, lng: -73.871985 }; // ER07610, 3346 Fulton St
const jobs = [
  { id: "ER07610", lat: 40.683503, lng: -73.871985, address: "3346 FULTON STREET, 11208", work: "x", open: true },
  { id: "ER07995", lat: 40.7086, lng: -73.9577, address: "178 HOOPER STREET, 11211", work: ":\nPUBLIC HALL CEILING REPAIRS - AT 2ND FLOOR", open: true },
  { id: "EQ31220", lat: 40.6827, lng: -73.8783, address: "418 AMBER STREET, 11208", work: "ENTRANCE DOOR REPAIRS\nNYC HPD EMERGENCY OPERATIONS DIVISION – “ESSENTIAL SERVICE WORK “ AT BUILDING ENTRANCE DOOR", open: true },
  { id: "ER00001", lat: 40.684, lng: -73.872, address: "CLOSED ONE", work: "", open: false },
];
const s = nextStop(here, jobs, "ER07610", new Date("2026-11-06T13:00:00-05:00"));
assert.equal(s.id, "EQ31220", "the nearest open one, not the job you're at, not a closed one");
assert.equal(s.miles, 0.3);
assert.equal(s.work, "entrance door repairs");
assert.equal(nextStopLine(s), `🧭 Next stop: EQ31220, 418 AMBER STREET: 0.3 mi, about ${s.minutes} min. The work: entrance door repairs.`);
const appt = nextStop(here, jobs.map((j) => (j.id === "ER07995" ? { ...j, appointmentToday: true } : j)), "ER07610");
assert.equal(appt.id, "ER07995", "an appointment today goes first");
assert.equal(workInWords(":\nPUBLIC HALL CEILING REPAIRS - AT 2ND FLOOR"), "public hall ceiling repairs");
assert.equal(nextStop(here, [jobs[0], jobs[3]], "ER07610"), null);
console.log("PASS next stop: nearest open job (appointments today first), miles, minutes, the work in a few words");
