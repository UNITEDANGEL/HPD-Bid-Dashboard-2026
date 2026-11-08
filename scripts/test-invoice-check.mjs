// 🧾 Invoice check: the amount against the award (work completed / partial), no award, no amount, the invoice date.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { invoiceCheck } = await loadLib("invoice-check");
assert.deepEqual(invoiceCheck({ outcome: "work_completed", amount: "$1,200.00", bidAmount: "$1,200.00" }), [{ tone: "ok", text: "The invoice matches the award: $1,200." }]);
assert.deepEqual(invoiceCheck({ outcome: "work_completed", amount: "", bidAmount: "$1,200.00" }), [{ tone: "ok", text: "The invoice matches the award: $1,200." }], "empty charge = the bid");
assert.equal(invoiceCheck({ outcome: "work_completed", amount: "1350", bidAmount: "$1,200.00" })[0].text, "The invoice is $1,350, $150 more than the award ($1,200). HPD pays the award unless a change was approved.");
assert.equal(invoiceCheck({ outcome: "work_completed", amount: "1100.50", bidAmount: "1200" })[0].text, "The invoice is $1,100.50, $99.50 less than the award ($1,200). HPD pays the award unless a change was approved.");
assert.deepEqual(invoiceCheck({ outcome: "partial_work_completed", amount: "600", bidAmount: "1200" }), [{ tone: "ok", text: "Partial work: $600 of the $1,200 award (50%)." }]);
assert.equal(invoiceCheck({ outcome: "partial_work_completed", amount: "1200", bidAmount: "1200" })[0].tone, "warn");
assert.equal(invoiceCheck({ outcome: "work_completed", amount: "500", bidAmount: "" })[0].text, "No award amount on file: check the amount on the COA before sending.");
assert.equal(invoiceCheck({ outcome: "work_completed", amount: "0", bidAmount: "0" }).length, 2);
assert.deepEqual(invoiceCheck({ outcome: "work_completed", amount: "1200", bidAmount: "1200", invoiceDate: "2026-11-05", workComplete: "11/07/26" }).map((l) => l.tone), ["ok", "warn"]);
assert.equal(invoiceCheck({ outcome: "work_completed", amount: "1200", bidAmount: "1200", invoiceDate: "2026-11-08", workComplete: "11/07/26" }).length, 1);
console.log("PASS invoice check: matches / more / less than the award, partial below the award, no award, no amount, dated before the work");
