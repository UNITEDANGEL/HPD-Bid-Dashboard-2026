// 🚪 Where the work is, for the worker (owner, 20 Nov: "Public hallway? Or is this location apartment"): read from HPD's description.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { workWhere, workFull } = await loadLib("crew-share");
const NL = String.fromCharCode(10);
const banner = "NYC HPD EMERGENCY OPERATIONS DIVISION - ESSENTIAL SERVICE WORK";
assert.equal(workWhere([banner, "AT BUILDING ENTRANCE DOOR, 1ST STORY, AT PUBLIC HAL L", "REPAIR TO MAKE DOORS SELF CLOSING"].join(NL)), "Public part of the building (not inside an apartment): building entrance door, 1st story, at public hal l");
assert.equal(workWhere(["AT BULKHEAD DOOR 6TH STORY", "SCOPE OF WORK: REMOVE THE SLIDE BOLT"].join(NL)), "Public part of the building (not inside an apartment): bulkhead door 6th story");
assert.equal(workWhere(["LOCATION: BATHROOM", "REPAIR LEAK"].join(NL), "4B"), "Inside the apartment (apt 4B): bathroom");
assert.match(workWhere(["PROPERLY CABINET DOORS IN THE KITCHEN LOCATED AT APT", "1252."].join(NL)), /^Inside the apartment/);
assert.equal(workWhere("REPAIR THE WINDOW GUARDS", "3A"), "Inside the apartment (apt 3A)");
assert.equal(workWhere("REPAIR THE WINDOW GUARDS"), null);
assert.equal(workFull([banner, "REPLACE   THE FAUCET.", "EST. $450", "PATCH CEILING"].join(NL)), ["REPLACE THE FAUCET.", "PATCH CEILING"].join(NL));
console.log("PASS work where: public hallway / bulkhead / apartment rooms / apt only / unknown; full description without the banner or prices");
