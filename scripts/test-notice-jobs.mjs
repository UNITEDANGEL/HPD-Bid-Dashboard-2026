// 📋 Notice jobs (owner, 6 Nov: "I don't see the work order number, the address, everything is missing"; "many jobs
// are already closed out, I still see them on the map"). Old jobs named on a vendor-tracking list get their address
// from the list itself; a job HPD closed reads "HPD closed the job", not "Already sent closed"; and a job still pending
// 3+ weeks after its completion date with nothing on file leaves the everyday map.
import assert from "node:assert/strict";
import { addressFromEmails, noticeOmos, recordOf } from "./add-notice-jobs.mjs";
import { loadLib } from "./daily-report.mjs";

const threads = [
  { subject: "Missing Documents", omos: ["EP04029", "EP07952"], messages: [{ hpd: true, text: "1. EP04029 - update / documents\nEP04029 - 1237 Dean Street, BK\nEP07952 - 835 Nostrand Avenue - BK. The estimate start date" }] },
  { subject: "CONFIRMATION OF AWARD", omos: ["ER09516"], messages: [{ hpd: true, text: "awarding OMO # ER09516" }] },
];
assert.deepEqual(noticeOmos(threads), ["EP04029", "EP07952"], "only jobs on notices / lists");
assert.deepEqual(addressFromEmails("EP04029", threads), { street: "1237 DEAN STREET", borough: "Brooklyn" });
assert.deepEqual(addressFromEmails("EP07952", threads), { street: "835 NOSTRAND AVENUE", borough: "Brooklyn" });
assert.equal(addressFromEmails("EP99999", threads), null);
const rec = recordOf({ omonumber: "ep22713", housenumber: "601", streetname: "MARCY AVENUE", zip: "11206", boro: "Brooklyn", omoawarddate: "2025-04-07T00:00:00.000", omoawardamount: "1890", omodescription: "aep apt 3b\u001a bathroom", latitude: "40.69", longitude: "-73.94" });
assert.equal(rec.OMO, "EP22713");
assert.equal(rec.BuildingAddress, "601 MARCY AVENUE, 11206");
assert.equal(rec.AwardDate, "04/07/25");
assert.equal(rec.JobDescription, "AEP APT 3B BATHROOM");
assert.equal(rec.Latitude, 40.69);
assert.ok(!("TenantName" in rec) && !("TenantPhone" in rec), "public facts only");

// HPD closed it: no "Already sent closed".
const { buildBoard } = await loadLib("notice-board");
const { checkNotices } = await loadLib("notice-check");
const now = Date.parse("2026-11-06T12:00:00-05:00");
const t2 = [{ id: "t", subject: "72 HR POOR PERFORMANCE NOTICE- OMO#ER03009", omos: ["ER03009"], people: ["J. Lewis"], messages: [{ at: "2026-10-22T10:00:00-04:00", hpd: true, mine: false, text: "Kindly see attached 72 HR POOR PERFORMANCE NOTICE", files: [] }] }];
const c = checkNotices(buildBoard({ threads: t2, sent: {}, marks: {}, closed: new Set(["ER03009"]), now }), t2, now);
assert.equal(c.items[0].tone, "done");
assert.equal(c.items[0].head, "✅ HPD closed the job. Nothing to send");

// 🧹 Old jobs off the map.
const { isStaleJob, usDay } = await loadLib("stale-jobs");
assert.equal(usDay("9/17/26"), Date.UTC(2026, 8, 17, 12));
const old = { OMO: "ER02772", WorkCompletionDate: "9/17/26", AwardDate: "09/02/26" };
assert.equal(isStaleJob(old, "pending", now), true, "7 weeks past due, nothing on file");
assert.equal(isStaleJob(old, "pending", now, true), false, "on a notice: stays");
assert.equal(isStaleJob({ ...old, KeepOnMap: true }, "pending", now), false, "📌 Keep");
assert.equal(isStaleJob({ ...old, FieldVisitHistory: [{ outcome: "no_access" }] }, "pending", now), false, "visited");
assert.equal(isStaleJob({ ...old, PaperworkSentAt: "2026-09-20" }, "pending", now), false);
assert.equal(isStaleJob(old, "followup", now), false);
assert.equal(isStaleJob({ OMO: "ER09516", WorkCompletionDate: "11/15/26" }, "pending", now), false, "not due yet");
assert.equal(isStaleJob({ OMO: "ER07193", WorkCompletionDate: "10/20/26" }, "pending", now), false, "only 17 days past");
assert.equal(isStaleJob({ OMO: "ER07704", AwardDate: "09/01/26" }, "pending", now), true, "no completion date: award + 14 days");
console.log("PASS notice jobs: addresses from the list, HPD closed = nothing to send, old nothing-on-file jobs off the map");
