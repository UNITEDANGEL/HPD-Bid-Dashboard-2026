// 👉 Do this (owner, 9 Nov: "tell me just very easily: go here, fix this ... notary stamp missing or a lot of data
// missing"): HPD's send-back emails as short fix steps, one plain line per notice, and the vendor tracking update lines.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";
const { fixSteps, plainFix, VT_LINES, vtDay, visitUpdate } = await loadLib("notice-fix");

// Their real wording (vendor tracking, Oct-Nov 2026).
let f = fixSteps("Kindly see attached affidavit & invoice with highlighted errors. Please make corrections & resubmit. Also note ALL documents are to be legitimately notarized.");
assert.equal(f.action, "correct");
assert.ok(f.steps.some((s) => /highlighted/.test(s)) && f.steps.some((s) => /Notary stamp/.test(s)), f.steps.join(" | "));
assert.match(f.steps.at(-1), /same dates/);
f = fixSteps("Kindly see attached affidavit & invoice with highlighted errors & missing information. Please rectify and resubmit. AFFIDAVIT- date directed by HPD is confirmation date of award.");
assert.ok(f.steps.some((s) => /award confirmation date/.test(s)) && f.steps.some((s) => /empty box/.test(s)), f.steps.join(" | "));
f = fixSteps("AFFIDAVIT- date directed by HPD is confirmation date of award.", "09/04/26");
assert.ok(f.steps.includes('Line 2 date ("directed by HPD on") = 09/04/26, the award confirmation date, not the work date.'), f.steps.join(" | "));
f = fixSteps("Please see attached invoice for OMO#ER01919 with incomplete highlighted areas.");
assert.ok(f.steps.some((s) => /empty box/.test(s)));
f = fixSteps("Hi Jot, Please note the copy you just resubmitted is blank.");
assert.equal(f.action, "resend"); assert.match(f.steps[0], /blank/);
f = fixSteps("I have previously requested the before-and-after photos and video for this OMO. Since you have already submitted the affidavit and invoice, there is no need to resubmit them.");
assert.equal(f.action, "photos"); assert.match(f.steps.join(" "), /photos and the video.*Don't send the affidavit/);

const now = Date.parse("2026-11-09T15:00:00Z");
const steps = (o = {}) => ({ replied: { done: false, at: "", how: "" }, made: { done: false, at: "", how: "" }, sent: { done: false, at: "", how: "" }, confirmed: { done: false, at: "", how: "" }, ...o });
const row = (o = {}) => ({ key: "k", omo: "ER01234", threadId: "t", subject: "24 HR Poor Performance Notice", kind: "ppn", hours: 24, who: "Joy-Ann Lewis", to: "lewisj@hpd.nyc.gov", noticeAt: "2026-11-05T14:00:00Z", dueAt: "2026-11-06T14:00:00Z", followUpAt: "", want: "", steps: steps(), next: "replied", sentAt: "", noticeText: "", lastMineAt: "", lastTheirsAt: "", filed: null, problem: null, answered: null, ...o });
let p = plainFix(row(), { now });
assert.equal(p.action, "reply"); assert.equal(p.tone, "late"); assert.match(p.headline, /^🔥 Overdue\. Send Lewis a short update/);
p = plainFix(row(), { now, visit: "Tue 11/11" });
assert.equal(p.action, "visit"); assert.match(p.headline, /You go Tue 11\/11\. Tell Lewis/);
p = plainFix(row({ problem: { at: "2026-11-07T10:00:00Z", text: "copy you just resubmitted is blank" }, steps: steps({ replied: { done: true, at: "x", how: "email" } }), next: "made" }), { now });
assert.equal(p.action, "resend"); assert.equal(p.tone, "fix");
p = plainFix(row({ next: "made", steps: steps({ replied: { done: true, at: "x", how: "email" } }), dueAt: "2026-11-12T14:00:00Z" }), { now });
assert.equal(p.action, "paperwork"); assert.equal(p.tone, "todo");
p = plainFix(row({ filed: { at: "2026-11-03T10:00:00Z", name: "ER01234 AFF INVOICE.pdf", here: false } }), { now });
assert.equal(p.action, "reply"); assert.match(p.headline, /Already emailed .*don't send it again/);
assert.equal(plainFix(row({ next: null }), { now }), null);
p = plainFix(row({ kind: "docs", who: "Deoranie Gafur", dueAt: "", hours: 0 }), { now });
assert.match(p.headline, /Answer Gafur/); assert.equal(p.tone, "todo");

// Vendor tracking update lines and the day.
assert.equal(vtDay("2026-11-11"), "on Wednesday, 11/11");
assert.equal(vtDay(""), "");
assert.equal(VT_LINES[0].text("ER01234", vtDay("2026-11-11")), "We are in touch on OMO# ER01234. We are going on Wednesday, 11/11 and will try to get it done that day.");
assert.match(VT_LINES.find((l) => l.key === "nextweek").text("ER01234", ""), /scheduled for next week\. We will update you/);
const v = visitUpdate(row(), "1 MAIN ST", vtDay("2026-11-11"));
assert.match(v.text, /^Hello Joy-Ann,\n\nRe: OMO# ER01234 - 1 MAIN ST\n\nWe are in touch with the tenant\. We are going on Wednesday, 11\/11/);
assert.equal(v.subject, "RE: 24 HR Poor Performance Notice");
console.log("notice-fix ok: HPD's send-backs as plain fix steps, one line per notice, vendor tracking update lines");
{
  const { silentDays, statusLine, statusEmail } = await loadLib("notice-fix");
  const st = (o = {}) => ({ replied: { done: false, at: "", how: "" }, made: { done: false, at: "", how: "" }, sent: { done: false, at: "", how: "" }, confirmed: { done: false, at: "", how: "" }, ...o });
  const r = (o = {}) => ({ key: "k", omo: "ER01234", threadId: "t", subject: "s", kind: "ppn", hours: 24, who: "Joy-Ann Lewis", to: "lewisj@hpd.nyc.gov", noticeAt: "2026-11-05T14:00:00Z", dueAt: "", followUpAt: "", want: "", steps: st(), next: "replied", sentAt: "", noticeText: "", lastMineAt: "", lastTheirsAt: "", filed: null, problem: null, ...o });
  // Thu notice, now Mon: Fri + Mon = 2 working days.
  assert.equal(silentDays(r(), Date.parse("2026-11-09T15:00:00Z")), 2);
  assert.equal(silentDays(r({ steps: st({ sent: { done: true, at: "2026-11-06", how: "email" } }) }), Date.parse("2026-11-09T15:00:00Z")), 0);
  assert.equal(statusLine(r(), "on Tuesday, 11/10"), "- OMO# ER01234: we are in touch with the tenant and going on Tuesday, 11/10.");
  assert.equal(statusLine(r({ problem: { at: "x", text: "blank" } })), "- OMO# ER01234: we are correcting the paperwork you sent back and will resend it.");
  const e = statusEmail([r(), r({ omo: "ER05678" })], "Joy-Ann Lewis");
  assert.match(e.text, /^Hello Joy-Ann,\n\nHere is where each open job stands:\n\n- OMO# ER01234: .*\n- OMO# ER05678: /);
  assert.equal(e.subject, "Status update: 2 open OMOs - United Angel Construction");
  console.log("notice-fix ok: 💤 working days with no word, 📋 one status email");
}
