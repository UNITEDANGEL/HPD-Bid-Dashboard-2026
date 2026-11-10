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
// ER04312 (owner, 9 Nov: "I want the notices to be able to auto fix ER04312"): HPD's exact words. Line 2 gets the award
// date, every box prints, the work dates stay as sent (no "enter the dates" ask), and the notary is the owner's part.
{
  const r = autoFix("Good day Jot, Kindly see attached affidavit & invoice with highlighted errors & missing information. Please rectify and resubmit. AFFIDAVIT- date directed by HPD is confirmation date of award. Thank you.", { ...ctx({ workStart: "9/12/2026", workComplete: "9/12/2026" }), workStart: "9/12/2026", workComplete: "9/12/2026", award: "09/04/2026" });
  assert.equal(r.changes.length, 0, "the work dates stay as sent");
  assert.ok(r.notes.includes('Line 2 ("That on ___ I was directed by HPD"): prints the Confirmation of Award date, 09/04/2026, not the work date.'), r.notes.join(" | "));
  assert.ok(r.notes.some((n) => /^Every box prints on the new copy/.test(n)));
  assert.ok(!r.checks.some((c) => /Work dates/.test(c)), r.checks.join(" | "));
}
// ER04312 itself was awarded 09/04/26: the new HPD form, no date on line 2.
assert.match(autoFix("AFFIDAVIT- date directed by HPD is confirmation date of award.", { ...ctx(), award: "09/04/2026", newForm: true }).notes.join(" "), /new affidavit form \(awarded 09\/04\/2026\).*no date to fill/);
{
  const r = autoFix("Kindly see attached affidavit & invoice with highlighted errors. Please make corrections & resubmit. Also note ALL documents are to be legitimately notarized.", ctx());
  assert.match(r.checks.join(" "), /real notary signs and stamps every page/);
  assert.ok(r.notes.some((n) => /^Every box prints/.test(n)));
}
assert.ok(autoFix("Hi Jot, Please note the copy you just resubmitted is blank.", ctx()).notes.some((n) => /can't come out blank/.test(n)));
// Nothing to change when the paperwork already matches HPD's record.
assert.equal(autoFix("INCORRECT BOROUGH ON THE INVOICE.", ctx({ borough: "Manhattan" })).changes.length, 0);
console.log("PASS auto-fix: borough (named / HPD record), apartment, address, end date from HPD's text, amount, section 5 phone check, OMO note, signature check, no change when already right");
