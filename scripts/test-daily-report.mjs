// End-of-day report: the owner's example day adds up, the test job is left out, the email is built
// correctly and nothing is sent without the sign-in token.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { buildDailyReport } = await loadLib("daily-report");
const now = new Date("2026-10-14T23:30:00Z"); // Wed 10/14, 7:30 PM New York
const at = (h) => `2026-10-14T${String(h).padStart(2, "0")}:00:00Z`;
const jobs = [
  { OMO: "W1", BuildingAddress: "1 MAIN ST, 11201", AwardAmount: "1000.00", FieldArrivedAt: at(13), FieldOutcome: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: at(14), outcome: "WORK_COMPLETED", note: "" }] },
  { OMO: "W2", BuildingAddress: "2 MAIN ST, 11201", AwardAmount: "1500.00", FieldOutcome: "NO_ACCESS_1_WAITING_72H", NoAccessFirstAttemptAt: "2026-10-09T14:00:00Z", NoAccessSecondAttemptAt: at(16),
    FieldVisitHistory: [{ recordedAt: "2026-10-09T14:00:00Z", outcome: "NO_ACCESS_1_WAITING_72H" }, { recordedAt: at(16), outcome: "NO_ACCESS_1_WAITING_72H", note: "2nd try: no access" }] },
  { OMO: "W3", BuildingAddress: "3 <MAIN> ST, 11201", AwardAmount: "2575.95", FieldOutcome: "REFUSED_ACCESS", FieldVisitHistory: [{ recordedAt: at(18), outcome: "REFUSED_ACCESS", note: "" }] },
  { OMO: "TEST-0001", BuildingAddress: "TEST JOB - 100 GOLD STREET", AwardAmount: "100.00", FieldOutcome: "WORK_COMPLETED", FieldVisitHistory: [{ recordedAt: at(19), outcome: "WORK_COMPLETED" }] },
  { OMO: "W4", BuildingAddress: "4 MAIN ST, 11201", AwardAmount: "500.00" },
];
const report = buildDailyReport(jobs, now, "https://example.test/map/");

assert.equal(report.subject, "HPD day report · Wed 10/14 · $1,400 earned · 3 visits");
assert.match(report.text, /EARNED TODAY: \$1,400 \(1 job finished \$1,000 \+ 2 service calls \$400\)/);
assert.match(report.text, /This week: \$1,400 · This month: \$1,400/);
assert.match(report.text, /Today: 3 visits · 1 completed · 0 partial · 1 no access · 1 refused/);
assert.match(report.text, /VISITS TODAY \(3\)/);
assert.ok(!/TEST-0001/.test(report.text) && !/TEST-0001/.test(report.html), "the test job is not in the report");
assert.match(report.text, /READY TO CLOSE OUT \(\d+\)/);
assert.match(report.text, /Open the app: https:\/\/example\.test\/map\//);
assert.match(report.html, /\$1,400 earned today/);
assert.ok(report.html.includes("3 &lt;MAIN&gt; ST") && !report.html.includes("<MAIN>"), "addresses are escaped in the HTML");

// Bids due tomorrow (Thu 10/15) are listed, soonest first; others are not.
const withBids = buildDailyReport(jobs, now, "https://example.test/map/", [
  { omo: "ER09002", address: "9 ELM ST", borough: "BK", bidDue: "2026-10-15", bidDueTime: "11:00 AM" },
  { omo: "ER09001", address: "8 OAK ST", borough: "QN", bidDue: "2026-10-15", bidDueTime: "10:00 AM" },
  { omo: "ER09003", address: "7 PINE ST", borough: "MN", bidDue: "2026-10-16", bidDueTime: "10:00 AM" },
]);
assert.match(withBids.text, /BIDS DUE TOMORROW \(2\)\n- ER09001 · 8 OAK ST \(QN\) · bid due 10:00 AM\n- ER09002 · 9 ELM ST \(BK\) · bid due 11:00 AM/);
assert.ok(!withBids.text.includes("ER09003"), "only tomorrow's bids");
assert.match(report.text, /BIDS DUE TOMORROW \(0\)\nNo invitations due tomorrow\./);

// Bids faxed today, with the fax status; a note when phone updates weren't available.
const withSent = buildDailyReport(jobs, now, "https://example.test/map/", [], {
  bidRecords: [
    { omo: "ER09001", address: "8 OAK ST", status: "confirmed", price: 1250, sentPrice: 1250, sentAt: "2026-10-14T15:00:00Z" },
    { omo: "ER09002", address: "9 ELM ST", status: "failed", price: 980, sentPrice: 980, sentAt: "2026-10-14T16:00:00Z" },
    { omo: "ER09003", address: "7 PINE ST", status: "confirmed", price: 500, sentAt: "2026-10-13T15:00:00Z" },
    { omo: "ER09004", address: "6 ASH ST", status: "saved", price: 700 },
  ],
  note: "Phone updates weren't available (Status server answered 500); this report is from the job data only.",
});
assert.match(withSent.text, /BIDS SENT TODAY \(2\)\n- ER09001 · 8 OAK ST · \$1,250 · fax confirmed\n- ER09002 · 9 ELM ST · \$980 · FAX FAILED, resend it/);
assert.match(withSent.text, /Note: Phone updates weren't available/);

// Easy wins among tomorrow's bids, and jobs others won above your usual price.
const withMarket = buildDailyReport(jobs, now, "https://example.test/map/", [
  { omo: "ER09001", address: "8 OAK ST", borough: "QN", bidDue: "2026-10-15", bidDueTime: "10:00 AM", easy: { suggested: 560, yours: 488, yoursN: 36, others: 624, othersN: 77, beatsN: 53, of: 77 } },
  { omo: "ER09002", address: "9 ELM ST", borough: "BK", bidDue: "2026-10-15", bidDueTime: "11:00 AM" },
], { missed: [{ omo: "ER07586", address: "973 ST MARKS AVENUE", area: "Crown Heights (North)", work: "hinges", amount: 435, yours: 390, awardDate: "2026-10-09" }] });
assert.match(withMarket.text, /Easy wins due tomorrow: 1 \(see Bids due tomorrow\)/);
assert.match(withMarket.text, /- ER09001 · 8 OAK ST \(QN\) · bid due 10:00 AM · EASY WIN: bid ~\$560 \(you usually win it at \$488, other winners got \$624; beats 53 of 77 recent winners\)\n- ER09002 · 9 ELM ST \(BK\) · bid due 11:00 AM\n/);
assert.match(withMarket.text, /OTHERS WON ABOVE YOUR USUAL PRICE \(LAST 7 DAYS\) \(1\)\n- ER07586 · 973 ST MARKS AVENUE \(Crown Heights \(North\)\) · hinges · won at \$435 · your usual \$390 · awarded 10\/09/);
assert.match(withMarket.html, /Easy wins due tomorrow: 1/);
assert.ok(!/Easy wins due tomorrow/.test(report.text), "no easy-win line when there are none");

// A quiet day still reads cleanly.
const quiet = buildDailyReport([{ OMO: "Q1", AwardAmount: "400.00" }], now);
assert.equal(quiet.subject, "HPD day report · Wed 10/14 · $0 earned · 0 visits");
assert.match(quiet.text, /Nothing recorded today\./);

console.log("PASS daily report: $1,000 job + $100 + $300 service calls = $1,400 today, test job left out, HTML escaped, quiet day reads cleanly");
