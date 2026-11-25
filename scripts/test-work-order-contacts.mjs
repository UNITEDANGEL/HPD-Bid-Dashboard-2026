// 📣 The vendor trackers a work order names (owner, 25 Nov, ER09991, a lead abatement job: "the email is on the third
// page underneath the description for Campbell and then CC everybody else"): read from HPD's page 3, in HPD's order.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { workOrderContacts } = await loadLib("email-people");
const NL = String.fromCharCode(10);
const page3 = ["AND/ OR VIA EMAIL TO INFORM THE TARGETTED START DATE AT LEAST 3 (THREE)", "NOTE 3: NOTE: CONTRACTOR MUST CONTACT HPD / EHU via email Campbell Camille", "CAMPBELC@hpd.nyc.gov, Serene To Tos@hpd.nyc.gov, Ramos Isolina RamosIs@hpd.nyc.gov"].join(NL);
const got = workOrderContacts(page3);
assert.deepEqual(got.map((p) => p.to), ["campbelc@hpd.nyc.gov", "tos@hpd.nyc.gov", "ramosis@hpd.nyc.gov"], "in HPD's order, first one gets it");
assert.match(got[0].who, /Campbell/);
assert.match(got[1].who, /Serene/);
assert.deepEqual(workOrderContacts("REPAIR THE WINDOW GUARDS"), [], "no names on the work order: Lewis as before");
assert.deepEqual(workOrderContacts("write to someone@gmail.com"), [], "HPD addresses only");
console.log("PASS work order contacts: ER09991's page 3 -> Campbell first, the others copied; none -> Lewis; HPD addresses only");
