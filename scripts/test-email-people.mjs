// ✉️ Email screen helpers: who can get an email (HPD only, Lewis / Gafur first) and the ready draft.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { emailPeople, emailDraft, isHpdAddress, EMAIL_LINES } = await loadLib("email-people");
const rows = [
  { who: "Someone Else", to: "else@hpd.nyc.gov", noticeAt: "2026-11-05T10:00:00Z" },
  { who: "Deoranie Gafur", to: "gafurd@hpd.nyc.gov", noticeAt: "2026-11-01T10:00:00Z" },
  { who: "Ms Lewis", to: "LewisA@hpd.nyc.gov", noticeAt: "2026-11-02T10:00:00Z" },
  { who: "Ms Lewis", to: "lewisa@hpd.nyc.gov", noticeAt: "2026-11-04T10:00:00Z" },
  { who: "Spam", to: "spam@gmail.com", noticeAt: "2026-11-06T10:00:00Z" },
];
const people = emailPeople(rows);
assert.deepEqual(people.map((p) => p.to), ["lewisa@hpd.nyc.gov", "gafurd@hpd.nyc.gov", "else@hpd.nyc.gov"]);
assert.equal(people[0].unit, "erp"); assert.equal(people[1].unit, "aep"); assert.equal(people[2].unit, "");
assert.ok(isHpdAddress("a.b@hpd.nyc.gov")); assert.ok(!isHpdAddress("a@hpd.nyc.gov.evil.com")); assert.ok(!isHpdAddress("x@gmail.com"));
const d = emailDraft({ omo: "ER07610", address: "1 MAIN ST", who: "Deoranie Gafur", line: EMAIL_LINES[0].text("ER07610") });
assert.equal(d.subject, "OMO# ER07610 - 1 MAIN ST");
assert.match(d.text, /^Hi Deoranie,\n\nThe work on OMO# ER07610 is finished/);
assert.match(d.text, /Jot Singh\nUnited Angel Construction Corp$/);
assert.equal(emailDraft({}).subject, "");
console.log("email-people ok");
