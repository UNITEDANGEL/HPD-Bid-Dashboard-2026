// The paperwork check catches what HPD rejected payment for (2024-2026 rejection notices), on the
// values printed on the affidavit and the invoice.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { checkPaperwork, isoDay } = await loadLib("paperwork-check");
const good = {
  outcome: "work_completed",
  affidavit: { OMO: "EQ12345", "Building Address": "241 EAST 115 STREET, APT B3, MANHATTAN, NY", "Start Date": "10/01/2026", "Complete Date": "10/03/2026" },
  invoice: { OMO: "EQ12345", "Building Address": "241 EAST 115 STREET", "Apt #": "APT B3", Borough: "MANHATTAN", "START DATE": "10/01/2026", "COMPLETE DATE": "10/03/2026", "TOTAL CHARGE": "$450.00" },
  signature: true, notaryDate: "10/04/2026", location: "APT B3",
};
assert.deepEqual(checkPaperwork(good), [], "a correct package passes");
const fields = (inp) => checkPaperwork(inp).map((i) => i.field);

// Dates (55 rejections): EL25850 "work started and completion dates do not match on the invoice + affidavit"
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, "COMPLETE DATE": "10/02/2026" } }), ["dates"]);
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, "COMPLETE DATE": "10/05/2026" } }), ["dates", "notary"], "a later invoice date is also after the notary date");
assert.ok(fields({ ...good, outcome: "refused_access", affidavit: { ...good.affidavit, "Denied Date": "10/03/2026", "Service Charge Amount": "$450.00" }, invoice: { ...good.invoice, "START DATE": "", "COMPLETE DATE": "" } }).includes("dates"), "refused access: the invoice needs the dates too");
assert.deepEqual(fields({ ...good, outcome: "no_access", affidavit: { ...good.affidavit, "Attempt1 Date": "10/01/2026", "Attempt2 Date": "10/03/2026", "Service Charge Amount": "$450.00" } }), [], "no access: attempts = invoice dates");
// Notary (39): missing, or before the work was done; a print copy is notarized in person.
assert.deepEqual(fields({ ...good, notaryDate: "" }), ["notary"]);
assert.deepEqual(fields({ ...good, notaryDate: "09/30/2026" }), ["notary"]);
assert.deepEqual(fields({ ...good, notaryDate: null, signature: null }), [], "print copy: signed and notarized by hand");
// Amount (30): EO00184 "THE INVOICE IS MISSING TOTAL CHARGE AMOUNT"
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, "TOTAL CHARGE": "" } }), ["amount"]);
assert.deepEqual(fields({ ...good, outcome: "partial_work_completed", affidavit: { ...good.affidavit, "Partial Amount": "$400.00" } }), ["amount"]);
// Area / apartment (25 + 20): EQ18525 "include the apartment number"; EL25850 "same area description on both"
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, "Apt #": "" }, location: "" }), ["location"]);
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, "Apt #": "BULKHEAD" } }), ["location"]);
// Borough: EN24456 "INCORRECT BOROUGH ON THE INVOICE"
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, Borough: "BROOKLYN" } }), ["borough"]);
assert.deepEqual(fields({ ...good, invoice: { ...good.invoice, Borough: "" } }), ["borough"]);
// Signature (19): EQ17038 "invoice is missing vendor signature"
assert.deepEqual(fields({ ...good, signature: false }), ["signature"]);
assert.equal(isoDay("10/4/26"), "2026-10-04");
console.log("PASS paperwork check: dates, notary, total charge, apartment / area, borough, signature, OMO (HPD's rejection reasons)");
