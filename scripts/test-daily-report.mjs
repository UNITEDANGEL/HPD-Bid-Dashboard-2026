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

// A quiet day still reads cleanly.
const quiet = buildDailyReport([{ OMO: "Q1", AwardAmount: "400.00" }], now);
assert.equal(quiet.subject, "HPD day report · Wed 10/14 · $0 earned · 0 visits");
assert.match(quiet.text, /Nothing recorded today\./);

console.log("PASS daily report: $1,000 job + $100 + $300 service calls = $1,400 today, test job left out, HTML escaped, quiet day reads cleanly");
