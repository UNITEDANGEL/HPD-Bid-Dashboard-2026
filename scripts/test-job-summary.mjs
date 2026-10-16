// The clean job summary on an invitation (real HPD wording): kind of work, square feet per kind, doors,
// expensive parts, where. The same numbers are what "My price" multiplies.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { jobSummary, lineText } = await loadLib("job-summary");
const show = (d) => jobSummary(d).lines.map(lineText);

// ER07263: vinyl floor, 120 sq ft removed and 120 installed = 120.
let s = jobSummary("RESTORE DEFECTIVE FLOORING AT APT C3 AT APT C3 PRIVATE HALLWAY: PROPERLY REMOVE THE DEFECTIVE VINYL FLOORING, APPROXIMATELY 120 SQ FT.. REPLACE WITH VINYL FLOORINGG APPROXIMATELY 120 SQ.FT. SEAL ALL EDGES AND CORNERS.");
assert.deepEqual(s.lines.map(lineText), ["Vinyl floor · 120 sq ft"]);
assert.deepEqual(s.where, ["Apt C3"]);
assert.deepEqual(s.rooms, ["private hallway"]);
// ER05098: Secure Tech lock + electronic strike plate + intercom, at the building entrance.
s = jobSummary("PUBLIC PARTS SUPPLY AND INSTALL SECURE TECH LOCK TO REPLACE DEFECTIVE LOCK AT BUILDING ENTRANCE DOOR PUBLIC HALL 1ST STORY, KEEP CYLINDER THE SAME . CONNECT ELECTRONIC STRIKE PLATE AND LOCKSET TO INTERCOM SYSTEM IF NECESSARY.");
assert.deepEqual(s.lines.map((l) => l.key), ["secure-tech", "electric-strike", "intercom"]);
assert.ok(s.where.includes("building entrance") && s.where.includes("1st floor"));
// ER08116: remove 24 + 20 sq ft, install 44 sq ft GWB (= 44); paint ceiling 120 + walls 500 (= 620).
assert.deepEqual(show("REMOVE ALL LOOSE, DEFECTIVE AND WATER-DAMAGED MATERIALS AT CEILING NEAR LIGHT FIXTURE APPROX. 24 SQ.FT. AND AT WALLS WHERE WATER-DAMAGED, INCLUDING BUT NOT LIMITED TO SOUTH WALL, APPROX. 20 SQ.FT., DOWN TO SOUND SUBSTRATE. REPAIR WATER-DAMAGED JOISTS, LATH AND SUBSTRATE AS NEEDED. INSTALL APPROX. 44 SQ.FT. 5/8\" TYPE-X FIRE-RATED GWB. TAPE, SPACKLE AND SAND SMOOTH. PREP, APPLY 1 COAT STAIN KILLING PRIMER TO REPAIRED AREAS AND 2 COATS PAINT TO ENTIRE PUBLIC HALL 1ST STORY CEILING APPROX. 120 SQ.FT. AND ALL WALLS APPROX. 500 SQ.FT.").filter((t) => /sq ft/.test(t)), ["Sheetrock / plaster · 44 sq ft", "Painting · 620 sq ft"]);
// Two doors with closers; "(2) electric strikes".
assert.deepEqual(show("REPLACE DEFECTIVE DOOR CLOSERS AT (2) FIRE DOORS 3RD FL. TOTAL DOORS = (2)"), ["Door closer · 2 doors"]);
assert.equal(jobSummary("INSTALL (2) NEW ELECTRIC STRIKES AT BLDG ENTRANCE AND VESTIBULE DOORS").lines.find((l) => l.key === "electric-strike").qty, 2);
// "ADAM WRITE" (HPD's spelling) is an Adams Rite lock.
assert.ok(jobSummary("REPLACE THE DEFECTIVE ADAM WRITE LOCKSET AT BLDG ENT DOOR").lines.some((l) => l.key === "entrance-lock"));
// Ceramic tile in a bathroom with a size.
assert.deepEqual(show("AT APT 3I BATHROOM REMOVE AND REPLACE DEFECTIVE CERAMIC FLOOR TILES APPROX 6 SQ FT"), ["Ceramic floor · 6 sq ft"]);
console.log("PASS job summary: vinyl 120 sq ft (removed = installed), Secure Tech + electric strike + intercom at the entrance, sheetrock 44 / paint 620 sq ft, 2 doors, (2) strikes, ADAM WRITE = Adams Rite, ceramic 6 sq ft, apartment / floor / rooms");
