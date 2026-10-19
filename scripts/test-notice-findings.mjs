// The head start on each notice (lib/notice-findings.ts): facts on record with dates, and the next step.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { noticeFindings } = await loadLib("notice-findings");
const text = (f) => f.lines.map((l) => l.text).join(" | ");

// Paperwork already sent: say when, resend.
let f = noticeFindings({ omo: "ER05228", job: { FieldOutcome: "WORK_COMPLETED", ActualWorkCompletionDate: "2026-09-28", FieldVisitHistory: [{ recordedAt: "2026-09-27T10:00:00Z", note: "Arrived" }, { recordedAt: "2026-09-28T10:00:00Z", note: "Done" }] }, sent: { sentAt: "2026-10-02", count: 6 }, pip: { status: "not paid yet", paid: 0, outstanding: 570 } });
assert.match(text(f), /Affidavit & invoice sent to HPD on 10\/2\/26 \(6 files\)/);
assert.match(text(f), /Work completed 9\/28\/26 \(from your app\)/);
assert.match(text(f), /2 visits recorded, last 9\/28\/26/);
assert.match(text(f), /PIP: not paid, \$570 open/);
assert.equal(f.advice.action, "resend");
assert.match(f.advice.text, /went out 10\/2\/26/);

// Refused access recorded, nothing sent: make that affidavit.
f = noticeFindings({ omo: "EQ32093", job: { FieldOutcome: "REFUSED_ACCESS", RefusalDate: "2026-10-10" } });
assert.match(text(f), /No affidavit or invoice on record/);
assert.match(text(f), /Refused access 10\/10\/26/);
assert.equal(f.advice.action, "make");
assert.equal(f.advice.outcome, "refused_access");

// No access, two tries.
f = noticeFindings({ omo: "EQ1", job: { FieldOutcome: "NO_ACCESS_COMPLETE", NoAccessFirstAttemptAt: "2026-10-01T09:00:00Z", NoAccessSecondAttemptAt: "2026-10-04T09:00:00Z" } });
assert.match(text(f), /No access \(2 tries\) 10\/1\/26 and 10\/4\/26/);
assert.equal(f.advice.outcome, "no_access");

// Nothing at all: send an update; the due date shows.
f = noticeFindings({ omo: "EQ2", job: { WorkCompletionDate: "2026-10-12" } });
assert.match(text(f), /No visit or outcome recorded/);
assert.match(text(f), /Work was due by 10\/12\/26/);
assert.equal(f.advice.action, "update");

// HPD paid / closed / rejected.
f = noticeFindings({ omo: "EQ3", job: null, hpd: { closedReason: "Work Not Started", amount: 440 }, pip: { status: "paid", paid: 440, outstanding: 0 }, rejection: { at: "2026-09-25", reason: "Invalid affidavit", answered: false } });
assert.match(text(f), /HPD closed it: Work Not Started \(\$440\)/);
assert.match(text(f), /PIP: paid \$440/);
assert.match(text(f), /Payment rejected 9\/25\/26: Invalid affidavit/);
assert.equal(f.advice.action, "check");
console.log("PASS notice findings: paperwork sent (date, files), outcome with dates, visits, due date, HPD / PIP / rejection; next step: resend / make (outcome) / update / check");
