// 📅 -> ✉ (owner, 6 Nov): a saved appointment goes to vendor tracking: Lewis for ERP jobs, Gafur for AEP jobs. No
// tenant name or phone in the email.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { unitOf, unitEmail, appointmentEmail, appointmentWhen } = await loadLib("appointment-notice");
assert.equal(unitOf("ENTRANCE DOOR REPAIRS NYC HPD EMERGENCY OPERATIONS DIVISION"), "erp");
assert.equal(unitOf("AEP APT 1D REPAIR BATHROOM CEILING LEAK"), "aep");
assert.equal(unitOf("ALTERNATIVE ENFORCEMENT PROGRAM (AEP) LOCATION= APT 3B"), "aep");
const rows = [
  { kind: "ppn", who: "Joy-Ann Lewis", to: "lewisj@hpd.nyc.gov", noticeAt: "2026-10-22T10:00:00Z" },
  { kind: "docs", who: "Deoranie Gafur", to: "gafurd@hpd.nyc.gov", noticeAt: "2026-10-07T10:00:00Z" },
];
assert.deepEqual(unitEmail("erp", rows), { to: "lewisj@hpd.nyc.gov", who: "Joy-Ann Lewis" });
assert.deepEqual(unitEmail("aep", rows), { to: "gafurd@hpd.nyc.gov", who: "Deoranie Gafur" });
assert.equal(unitEmail("erp", []), null);
assert.equal(appointmentWhen({ date: "2026-11-10", start: "10:00", end: "12:00" }), "Tuesday, 11/10 between 10:00 AM and 12:00 PM");
const m = appointmentEmail({ omo: "ER02772", address: "172-17 JAMAICA AVENUE, 11432", appointment: { date: "2026-11-10", start: "10:00", end: "12:00" }, who: "Joy-Ann Lewis" });
assert.equal(m.subject, "OMO# ER02772 - appointment scheduled for Tuesday, 11/10");
assert.match(m.text, /^Hello Joy-Ann,\n\nRe: OMO# ER02772 - 172-17 JAMAICA AVENUE, 11432\n\nTo keep you in the loop: we scheduled the appointment with the tenant for Tuesday, 11\/10 between 10:00 AM and 12:00 PM to do the work\./);
assert.match(appointmentEmail({ omo: "ER1", address: "", appointment: { date: "2026-11-11", start: "14:30", end: "" }, who: "", changed: true }).text, /^Hello,\n[\s\S]*moved the appointment with the tenant for Wednesday, 11\/11 at 2:30 PM/);
console.log("PASS appointment -> vendor tracking: ERP to Lewis, AEP to Gafur, the day and time, no tenant details");
