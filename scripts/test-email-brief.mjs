// 📩 HPD emails in 20 seconds: who wrote, which job, what they want, from the email's own words (no AI).
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { briefLine, emailBrief, firstWords, wantOf } = await loadLib("email-brief");
const { parseCommand } = await loadLib("voice-agent");
const fix = "Good Day Jot, Kindly see attached affidavit & invoice with highlighted errors. Please make corrections & resubmit. [cid:c4a274b1-fac1] Thanks";
assert.equal(firstWords(fix), "Kindly see attached affidavit & invoice with highlighted errors.");
assert.equal(wantOf(fix), "wants the paperwork fixed and sent again");
assert.equal(wantOf("Hello, please submit the affidavit and invoice for this job."), "wants the affidavit and invoice");
assert.equal(wantOf("Hi, what is the status of the work at this address?"), "wants a status update");
assert.equal(wantOf("Thank you, your documents were received and processed."), "says it was received / approved");
assert.equal(wantOf("Lunch?"), "");
assert.equal(briefLine({ from: "Joy-Ann Lewis <jlewis@hpd.nyc.gov>", omo: "ER05228", text: fix, at: "2026-11-07T14:00:00Z" }),
  "Joy-Ann Lewis about ER05228: wants the paperwork fixed and sent again (“Kindly see attached affidavit & invoice with highlighted errors.”)");
assert.equal(briefLine({ from: "Gafur", omo: "", text: "Call me when you can about the building on Monday.", at: "" }), "Gafur: “Call me when you can about the building on Monday.”");
const b = emailBrief([
  { from: "A", omo: "ER1", text: "Please send the affidavit and invoice.", at: "2026-11-07T10:00:00Z" },
  { from: "B", omo: "ER2", text: "What is the status?", at: "2026-11-07T12:00:00Z" },
]);
assert.equal(b, "📧 2 new HPD emails:\n• B about ER2: wants a status update (“What is the status?”)\n• A about ER1: wants the affidavit and invoice (“Please send the affidavit and invoice.”)");
assert.equal(emailBrief([]), "");
for (const q of ["any new hpd emails", "what did hpd email me", "read me my hpd emails", "new emails from hpd"]) assert.equal(parseCommand(q).intent, "hpd-emails", q);
console.log("PASS email brief: greeting and junk out, what they want from their words, newest first, the voice question understood");
