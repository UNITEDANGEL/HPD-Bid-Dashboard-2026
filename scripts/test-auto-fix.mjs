// Auto-fix from HPD's real rejection reasons: what changes, from HPD's record / the paperwork sent.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { autoFix } = await loadLib("auto-fix");
const ctx = (current = {}) => ({ omo: "EN30847", address: "133 SEAMAN AVENUE", borough: "MN", location: "APT 5D", amount: 1500, workStart: "3/19/2026", workComplete: "3/19/2026", tenantPhone: "", current });
const fields = (r) => Object.fromEntries(r.changes.map((c) => [c.field, c.to]));

assert.deepEqual(fields(autoFix("PLEASE SEND IN A NEW INVOICEAND AFFIDAVIT (incorrect borough written on the invoice and affidavit should be Manhattan instead of the bronx) THANK YOU", ctx({ borough: "Bronx" }))), { borough: "Manhattan" });
assert.deepEqual(fields(autoFix("PLEASE CORRECT INVOICE AND AFFIDAVIT TO SHOW THE CORRECT WORK LOCATION / APT: 3E. THANK YOU", ctx({ location: "APT 3F" }))), { location: "APT 3E" });
assert.deepEqual(fields(autoFix("Address is spelled incorrectly on Invoice and affidavit. 133 Seaman Ave", ctx({ address: "133 SEMAN AVE" }))), { address: "133 SEAMAN AVENUE" });
assert.deepEqual(fields(autoFix("PLEASE CORRECT AND RESUBMIT A NEW INVOICE. END WORK DATE ON THE INVOICE (02/27/2023) TO MATCH THE END WORK DATE ON THE AFFIDAVIT WHICH IS 03/01/2023. THANK YOU,", ctx({ workComplete: "2/27/2023", workStart: "3/19/2026" }))), { workComplete: "3/1/2023" });
assert.deepEqual(fields(autoFix("PLEASE SEND IN A NEW INVOICE AND AFFIDAVIT FOR $1,500. THANK YOU", ctx({ amount: "$1,200.00" }))), { amount: "$1,500.00" });
const phone = autoFix("PLEASE COMPLETE SECTION #5 OF THE AFFIDAVIT. TENANT PHONE NUMBER IS MISSING.", ctx());
assert.equal(phone.changes.length, 0); assert.match(phone.checks[0], /Section 5/);
assert.match(autoFix("PLEASE SUBMIT A NEW AFFIDAVIT SHOWING ON THE SECOND PAGE THE CORECT OMO# EN30847 NOT EO00521.", ctx()).notes.join(" "), /every page prints EN30847/);
assert.match(autoFix("Invoice is invalid because the invoice is not signed.", ctx()).checks.join(" "), /blue ink/);
// Nothing to change when the paperwork already matches HPD's record.
assert.equal(autoFix("INCORRECT BOROUGH ON THE INVOICE.", ctx({ borough: "Manhattan" })).changes.length, 0);
console.log("PASS auto-fix: borough (named / HPD record), apartment, address, end date from HPD's text, amount, section 5 phone check, OMO note, signature check, no change when already right");
