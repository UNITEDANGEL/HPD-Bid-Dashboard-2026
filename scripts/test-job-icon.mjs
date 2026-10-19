// A picture for the kind of job on the bid pins (lib/job-icon.ts): the most telling item wins.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { jobIcon } = await loadLib("job-icon");
const cases = [
  ["REPLACE 3 DEFECTIVE HINGES AT PUBLIC HALL DOOR", "🔩"],
  ["TRACE AND REPAIR LEAK FROM APT 4B AFFECTING BATHROOM CEILING; PLASTER AND PAINT 40 SQ FT", "💧"],
  ["REPAIR OR REPLACE DEFECTIVE SELF CLOSING DEVICE (DOOR CLOSER) AT ENTRANCE DOOR", "🚪"],
  ["REPLACE BROKEN WINDOW GLASS IN LIVING ROOM", "🪟"],
  ["PROVIDE AND INSTALL SECURE TECH LOCK AT ENTRANCE DOOR", "🔐"],
  ["SOMETHING UNREADABLE", "🛠️"],
];
for (const [d, want] of cases) assert.equal(jobIcon(d).icon, want, d);
assert.ok(jobIcon(cases[1][0]).more >= 1, "leak + paint: more items");
console.log("PASS job icon: hinges 🔩, leak 💧 (over the painting), closer 🚪, glass 🪟, Secure Tech 🔐, unknown 🛠️");
