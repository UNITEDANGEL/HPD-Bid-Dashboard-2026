// Auto-resend a failed bid fax (lib/bid-records.ts autoResendPlan): same price, next HPD line, once per failure, up to 3,
// only before it's due.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { autoResendPlan, lineOf, minutesToDue } = await loadLib("bid-records");
const failed = { omo: "ER06690", address: "124 EAST 103 STREET", bidDue: "2026-10-19", bidDueTime: "11:00 AM", price: 2200, sentPrice: 2200, status: "failed", sentAt: "2026-10-19T13:20:18Z", confirmedAt: "2026-10-19T13:33:30Z", faxTo: "2128638655@humblefax.com", attempts: 1, savedAt: "", updatedAt: "" };
const at = (iso) => new Date(iso);
assert.equal(lineOf("2128638655@humblefax.com"), "main");
assert.equal(lineOf("2128637804@humblefax.com"), "7804");
assert.equal(minutesToDue(failed, at("2026-10-19T14:11:00Z")), 49, "10:11 AM -> 49 minutes to 11:00 AM");
assert.deepEqual(autoResendPlan(failed, at("2026-10-19T14:11:00Z")), { line: "7804", minutesLeft: 49 }, "main failed -> the next line");
assert.equal(autoResendPlan({ ...failed, faxTo: "2128637805@humblefax.com" }, at("2026-10-19T14:11:00Z")).line, "main", "last line -> back to the first");
assert.equal(autoResendPlan(failed, at("2026-10-19T15:01:00Z")), null, "past due: no resend");
assert.equal(autoResendPlan({ ...failed, autoResendFor: failed.confirmedAt }, at("2026-10-19T14:11:00Z")), null, "this failure already answered");
assert.equal(autoResendPlan({ ...failed, autoResends: 3 }, at("2026-10-19T14:11:00Z")), null, "at most 3 automatic sends");
assert.equal(autoResendPlan({ ...failed, price: 2000 }, at("2026-10-19T14:11:00Z")), null, "a revision in progress: you send it");
assert.equal(autoResendPlan({ ...failed, status: "confirmed" }, at("2026-10-19T14:11:00Z")), null);
assert.equal(minutesToDue({ bidDue: "2026-12-07", bidDueTime: "2:30 PM" }, at("2026-12-07T19:00:00Z")), 30, "winter time");
console.log("PASS auto resend: next line, once per failure, max 3, only before due, never for a revision");
