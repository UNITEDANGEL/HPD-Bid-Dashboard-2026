// Paperwork lock: sent paperwork locks the job; Revise keeps the sent version (outcome, dates, when and
// where it went, the reason) and opens the job again.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { paperworkLock, revisionPatch, lockedMessage } = await loadLib("paperwork-lock");

assert.equal(paperworkLock({}).locked, false, "nothing sent: not locked");
assert.equal(paperworkLock({ PackageGeneratedAt: "2026-10-01T10:00:00Z", PackageReviewStatus: "Pending review" }).locked, false, "a draft isn't locked");
const sent = {
  OMO: "EQ26843", FieldOutcome: "NO_ACCESS_COMPLETE", PackageApprovedAt: "2026-10-02T15:00:00Z", PackageEmailedAt: "2026-10-02T15:01:00Z",
  PackageEmailedTo: "owner@example.test", PackageDriveLink: "https://drive.example/f/1",
  NoAccessFirstAttemptAt: "2026-09-25T13:00:00Z", NoAccessSecondAttemptAt: "2026-09-29T14:00:00Z",
  FieldVisitHistory: [{ recordedAt: "2026-09-29T14:00:00Z", outcome: "NO_ACCESS_COMPLETE" }],
};
const lock = paperworkLock(sent);
assert.deepEqual([lock.locked, lock.outcome, lock.emailedTo], [true, "NO_ACCESS_COMPLETE", "owner@example.test"]);
assert.match(lockedMessage("EQ26843", lock), /🔒 EQ26843: paperwork was sent to HPD on 10\/2\/26, so the job is locked\. .*Revise paperwork/);
assert.equal(paperworkLock({ PackageReviewStatus: "Approved", PackageGeneratedAt: "2026-10-02T15:00:00Z" }).locked, true, "approved by status alone also locks");

// Revise: the sent version is kept with the reason; the job opens again.
const patch = revisionPatch(sent, "Got access on 10/20, work done", "2026-10-20T12:00:00Z");
assert.equal(patch.PackageApprovedAt, "");
assert.equal(patch.PackageReviewStatus, "Revising");
assert.equal(patch.PaperworkRevisions.length, 1);
assert.deepEqual(patch.PaperworkRevisions[0], {
  revisedAt: "2026-10-20T12:00:00Z", reason: "Got access on 10/20, work done", outcome: "NO_ACCESS_COMPLETE",
  approvedAt: "2026-10-02T15:00:00Z", emailedAt: "2026-10-02T15:01:00Z", emailedTo: "owner@example.test", driveLink: "https://drive.example/f/1",
  dates: { NoAccessFirstAttemptAt: "2026-09-25T13:00:00Z", NoAccessSecondAttemptAt: "2026-09-29T14:00:00Z" },
});
assert.match(patch.FieldVisitHistory.at(-1).note, /Paperwork revision started \(sent version kept\): Got access on 10\/20/);
const reopened = { ...sent, ...patch };
assert.equal(paperworkLock(reopened).locked, false, "open again after Revise");
assert.equal(paperworkLock(reopened).revisions.length, 1);
// Sent again after the revision: locked again, both versions on record.
const resent = { ...reopened, FieldOutcome: "WORK_COMPLETED", PackageApprovedAt: "2026-10-21T10:00:00Z" };
assert.equal(paperworkLock(resent).locked, true);
assert.equal(revisionPatch(resent, "Second change").PaperworkRevisions.length, 2, "every revision is kept");
console.log("PASS paperwork lock: sent paperwork locks the job; Revise keeps the sent version with dates and reason, opens the job, and every revision is kept");
