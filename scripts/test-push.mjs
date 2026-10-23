// Phone alerts (20 Oct): the server keeps a phone's push address encrypted (PUSH-<id> on the status server) and only
// takes real push-service addresses; the fetcher's sender finds what's new (HPD wrote / replied, a new invitation, a
// 24-hour notice under 6 hours) and decrypts the addresses with the same key.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handlePushSubscribe } from "../server/drive-packages.mjs";
import { eveningWrapup, findAlerts, moneyReport, morningBriefing, openSealed, workingHours } from "./send-push.mjs";
import { loadLib } from "./daily-report.mjs";

const key = crypto.randomBytes(32);
const env = { HPD_PRIVATE_DATA_KEY: key.toString("base64") };
const posted = [];
const fetcher = async (url, opts) => { posted.push({ url, body: JSON.parse(opts.body) }); return Response.json({ ok: true }); };
const sub = { endpoint: "https://web.push.apple.com/QGx1Y2FzLXRlc3QtZW5kcG9pbnQ", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
// No Google sign-in needed (21 Oct: "this has to be automatic"); signed in or not is kept with the phone.
const call = (body, signedIn = false) => handlePushSubscribe(new Request("https://app.example.test/api/drive/push-subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, fetcher, signedIn);

const res = await call({ subscription: sub, device: "iPhone" });
assert.equal(res.status, 200);
const d = await res.json();
assert.match(d.id, /^[0-9a-f]{16}$/);
assert.equal(posted.length, 1);
assert.match(posted[0].url, /\/override$/);
assert.equal(posted[0].body.key, `PUSH-${d.id}`);
assert.ok(!JSON.stringify(posted[0].body).includes("web.push.apple.com"), "the address is not stored in plain text");
assert.deepEqual(JSON.parse(openSealed(Buffer.from(posted[0].body.patch.enc, "base64"), key).toString("utf8")), sub, "the sender can open it with the same key");
assert.equal(posted[0].body.patch.device, "iPhone");
assert.equal(posted[0].body.patch.signedIn, false, "works without signing in (short alerts)");
assert.equal((await (await call({ subscription: sub }, true)).json()).signedIn, true);
assert.equal((await call({ subscription: { ...sub, endpoint: "https://evil.example.com/x" } })).status, 400, "only push services");
assert.equal((await call({ subscription: { ...sub, keys: { p256dh: "x", auth: "y" } } })).status, 400);
const off = await (await call({ subscription: sub, off: true })).json();
assert.equal(off.off, true);
assert.equal(posted.at(-1).body.patch.off, true, "turn off keeps the record, marked off");
console.log("PASS push-subscribe: phone address encrypted (not in plain text), PUSH-<id> on the status server, the sender opens it, non-push addresses refused, turn off marks it off");

// What's new for an alert.
const now = Date.parse("2026-10-20T15:00:00Z");
const conversations = { threads: [
  { id: "g1", subject: "RE: OMO EP27382", omos: ["EP27382"], messages: [
    { at: "2026-10-20T14:47:00Z", mine: true, hpd: false, from: "me", subject: "Re: OMO EP27382" },
    { at: "2026-10-20T14:56:00Z", mine: false, hpd: true, from: '"Gafur, Deoranie (HPD)" <GafurD@hpd.nyc.gov>', subject: "RE: [EXTERNAL] Re: OMO EP27382" },
  ] },
  { id: "old", subject: "old", omos: ["EQ00001"], messages: [{ at: "2026-10-10T14:00:00Z", mine: false, hpd: true, from: "x", subject: "old" }] },
  { id: "n24", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ99997", omos: ["EQ99997"], kind: "past due", people: ["Test Tracker"], messages: [{ at: "2026-10-19T17:00:00Z", mine: false, hpd: true, from: "test@hpd.nyc.gov", subject: "24 HR", text: "Notice test@hpd.nyc.gov" }] },
] };
const bids = [{ omo: "ER09999", address: "1 TEST PLACE", bidDue: "2026-10-21", bidDueTime: "11:00 AM" }, { omo: "ER00001", address: "past", bidDue: "2026-10-01", bidDueTime: "11:00 AM" }];
conversations.threads.push(
  { id: "lw", subject: "OMO#ER05581- STATUS UPDATE", omos: ["ER05581"], kind: "correction", messages: [{ at: "2026-10-20T13:00:00Z", mine: false, hpd: true, from: "Lewis, Joy-Ann (HPD)", subject: "OMO#ER05581- STATUS UPDATE" }] },
  { id: "rj", subject: "Invoice Rejection Notice - OMO EL25850", omos: ["EL25850"], kind: "rejection", messages: [{ at: "2026-10-20T12:00:00Z", mine: false, hpd: true, from: "Department of Housing Preservation Accounts Payable", subject: "Invoice Rejection Notice" }] },
  { id: "ms", subject: "CONFIRMATION OF AWARD", omos: ["EQ40000"], kind: "award", messages: [{ at: "2026-10-20T11:00:00Z", mine: false, hpd: true, from: "Atkins, Kim (HPD)", subject: "CONFIRMATION OF AWARD" }] },
);
const requests = { jobs: { EQ12345: { rejectedAt: "2026-10-19", rejectedReason: "Wrong completion date" }, EQ00002: { rejectedAt: "2026-09-01" } } };
const alerts = await findAlerts({ conversations, bids, sent: {}, requests, now, loadLib });
const titles = alerts.map((a) => a.title);
// Each kind its own alert (20 Oct: "unique alerts for bids, notices, rejections, requests").
assert.ok(titles.includes("📋 Deoranie Gafur replied · EP27382"), titles.join(" | "));
assert.ok(titles.includes("📋 Joy-Ann Lewis sent a request · ER05581"), "Lewis's status update is a request");
assert.ok(titles.includes("💵 Payment rejected · EL25850 · Department of Housing Preservation Accounts Payable") || titles.some((t) => /^💵 Payment rejected · EL25850/.test(t)), titles.join(" | "));
assert.ok(titles.includes("💵 Payment rejected · EQ12345"), "a new rejection in HPD's notices");
assert.ok(!titles.some((t) => /EQ00002/.test(t)), "old rejections don't alert");
assert.ok(titles.includes("💰 You won · EQ40000! · Kim Atkins"), `an award is its own (cha-ching) alert: ${titles.join(" | ")}`);
assert.equal(alerts.find((x) => /EQ40000/.test(x.title)).kind, "award");
assert.ok(titles.some((t) => /^⏱ 24-hour notice · EQ99997 from /.test(t)), "a new 24-hour notice");
const kindsSeen = new Set(alerts.map((a) => a.kind));
for (const k of ["award", "notice", "request", "rejection", "bid", "urgent"]) assert.ok(kindsSeen.has(k), `kind ${k}`);
assert.ok(!titles.some((t) => /EQ00001/.test(t)), "old emails don't alert");
assert.ok(titles.includes("🧾 New invitation to bid · ER09999"));
assert.ok(!titles.some((t) => /ER00001/.test(t)), "past invitations don't alert");
assert.ok(titles.some((t) => /^⏰ EQ99997: \d+ h left on the notice$/.test(t)), titles.join(" | "));
assert.ok(alerts.every((a) => /^[ebur]:[0-9a-f]{16}$/.test(a.key) || /^[mw]:\d{4}-\d{2}-\d{2}$/.test(a.key)), "kept as short hashes (briefing / wrap-up by their day)");
assert.equal(alerts.find((a) => /Gafur/.test(a.title)).url, "/map/?view=all&map=1&board=1&omo=EP27382", "the alert opens that job on the board");
assert.equal(alerts.find((a) => /EQ12345/.test(a.title)).url, "/map/?view=all&map=1&money=1&omo=EQ12345", "a rejection opens that job");
console.log("PASS phone alert finder: a different alert per kind: 💰 award (cha-ching), ⏱ notice, 📋 request (Gafur replied, Lewis status update), 💵 rejection (email + HPD notices), 📩 message, 🧾 invitation, ⏰ under 6 h; old ones left out; short hashes; rejections open the rejections");

// An overdue notice alerts once, never again (owner, 22 Oct: "hear it once, then it says on screen; ER01987 keeps
// repeating"): the same alert key at every hour, so the sender's memory stops a second one; no "o:" repeats.
{
  const threads = [{ id: "od", subject: "72 HR POOR PERFORMANCE NOTICE - OMO#ER01987", omos: ["ER01987"], kind: "past due", people: ["Joy-Ann Lewis"], messages: [{ at: "2026-10-16T19:58:35Z", mine: false, hpd: true, from: "Lewis, Joy-Ann (HPD)", subject: "72 HR", text: "Notice lewisj@hpd.nyc.gov" }] }];
  const at = (iso) => findAlerts({ conversations: { threads }, bids: [], sent: {}, requests: {}, now: Date.parse(iso), loadLib });
  const keys = [];
  for (const iso of ["2026-10-21T22:00:00Z", "2026-10-22T13:00:00Z", "2026-10-22T17:00:00Z"]) keys.push((await at(iso)).filter((a) => /ER01987/.test(a.title) && a.kind === "urgent").map((a) => a.key));
  assert.ok(keys.every((k) => k.length === 1 && !k[0].startsWith("o:")), `one urgent alert each time, no repeat reminders: ${JSON.stringify(keys)}`);
  assert.equal(new Set(keys.map((k) => k[0])).size, 1, "the same key every time: sent once");
  assert.equal(workingHours(Date.parse("2026-10-24T15:00:00Z")), false, "Saturday");
  console.log("PASS overdue notice: ER01987 alerts once (same key every hour, no 2-hour repeats)");
}

// ☀️ Morning briefing: once a weekday from 8 AM, the day in one alert.
{
  const threads = [
    { id: "od", subject: "72 HR POOR PERFORMANCE NOTICE - OMO#ER01987", omos: ["ER01987"], kind: "past due", people: ["Joy-Ann Lewis"], messages: [{ at: "2026-10-16T19:58:35Z", mine: false, hpd: true, from: "Lewis, Joy-Ann (HPD)", subject: "72 HR", text: "Notice lewisj@hpd.nyc.gov" }] },
  ];
  const bids = [{ omo: "ER1", bidDue: "2026-10-22", bidDueTime: "11:00 AM" }, { omo: "ER2", bidDue: "2026-10-22", bidDueTime: "2:00 PM" }, { omo: "ER3", bidDue: "2026-10-23", bidDueTime: "11:00 AM" }];
  const requests = { jobs: { EQ1: { rejectedAt: "2026-10-10" }, EQ2: { rejectedAt: "2026-10-01" }, EQ3: { rejectedAt: "2026-10-05" } } };
  const sent = { EQ3: { sentAt: "2026-10-08" } }; // fixed and sent after the rejection
  const b = await morningBriefing({ conversations: { threads }, bids, sent, requests, now: Date.parse("2026-10-22T12:30:00Z"), loadLib }); // Thu 8:30 AM NY
  assert.equal(b.key, "m:2026-10-22", "once a day");
  assert.equal(b.url, "/map/?view=all&map=1&today=1");
  assert.match(b.body, /🧾 2 bids due today \(first 11:00 AM\)/);
  assert.match(b.body, /⏰ 1 notice overdue \(ER01987\)/);
  assert.match(b.body, /💵 2 payment rejections to fix/);
  assert.equal(await morningBriefing({ conversations: { threads }, bids, sent, requests, now: Date.parse("2026-10-22T10:30:00Z"), loadLib }), null, "not before 8 AM");
  assert.equal(await morningBriefing({ conversations: { threads }, bids, sent, requests, now: Date.parse("2026-10-24T14:00:00Z"), loadLib }), null, "not on Saturday");
  const quiet = await morningBriefing({ conversations: { threads: [] }, bids: [], sent: {}, requests: {}, now: Date.parse("2026-10-22T12:30:00Z"), loadLib });
  assert.match(quiet.title, /nothing urgent today/);
  console.log(`PASS morning briefing: weekdays from 8 AM, once a day: "${b.body}"; nothing before 8 or on weekends; a quiet day says so`);
}

// 🌆 Evening wrap-up: weekdays from 6 PM, what got done today and what's left.
{
  const at = (h) => `2026-10-22T${h}:00:00Z`; // Thursday; 22:30Z = 6:30 PM NY
  const records = {
    "BID-ER1": { sentAt: at("14"), status: "confirmed", bidDue: "2026-10-22" },
    "BID-ER2": { sentAt: at("15"), status: "sent", bidDue: "2026-10-23" },
    "BID-ER3": { sentAt: at("16"), status: "failed", bidDue: "2026-10-23" },
    "BID-ER9": { sentAt: "2026-10-21T15:00:00Z", status: "confirmed", bidDue: "2026-10-21" }, // yesterday
    "NOBID-ER4": { at: at("17"), faxedAt: at("17"), faxStatus: "confirmed" },
  };
  const threads = [{ id: "n1", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ1", omos: ["EQ1"], kind: "past due", people: ["L"], messages: [{ at: "2026-10-22T13:00:00Z", hpd: true, mine: false, from: "x@hpd.nyc.gov", subject: "24 HR", text: "x@hpd.nyc.gov" }, { at: at("15"), hpd: false, mine: true, from: "me", subject: "Re", text: "", files: ["a.pdf"] }] }];
  const bids = [{ omo: "ER2", bidDue: "2026-10-23", bidDueTime: "10:00 AM" }, { omo: "ER5", bidDue: "2026-10-23", bidDueTime: "11:30 AM" }, { omo: "ER6", bidDue: "2026-10-23", bidDueTime: "2:00 PM" }];
  const w = await eveningWrapup({ conversations: { threads }, bids, sent: {}, records, now: Date.parse("2026-10-22T22:30:00Z"), loadLib });
  assert.equal(w.key, "w:2026-10-22");
  assert.match(w.body, /📠 3 bids faxed \(1 confirmed, 1 waiting, 1 failed\)/);
  assert.match(w.body, /🚫 1 NO BID/);
  assert.match(w.body, /✉ 1 notice \/ request answered/);
  assert.match(w.body, /🧾 tomorrow: 2 bids to send \(first 11:30 AM\)/, "ER2 already sent for tomorrow");
  assert.equal(await eveningWrapup({ conversations: { threads }, bids, sent: {}, records, now: Date.parse("2026-10-22T20:30:00Z"), loadLib }), null, "not before 6 PM");
  console.log(`PASS evening wrap-up: weekdays from 6 PM, once a day: "${w.body}"`);
}

// 💵 Friday money report: Fridays from 2 PM, what HPD owes and what holds it up.
{
  const pip = { generatedAt: "2026-10-15T01:00:00Z", jobs: {
    EQ1: { status: "not paid yet", outstanding: 400, closed: false, lastDate: "2026-07-01" },
    EQ2: { status: "not paid yet", outstanding: 1000, closed: false, lastDate: "2026-10-01" },
    EQ3: { outstanding: 500, closed: true, lastDate: "2026-06-01" }, // closed: not owed
    EQ4: { outstanding: 0, closed: false, lastDate: "2026-10-01" },
  } };
  const payments = { generatedAt: "2026-10-22T01:00:00Z", recent: [{ date: "2026-10-20", status: "Paid", amount: 590 }, { date: "2026-10-21", status: "Paid", amount: 410 }, { date: "2026-10-01", status: "Paid", amount: 9999 }] };
  const requests = { jobs: { EQ1: { rejectedAt: "2026-10-10", rejectedTs: Date.parse("2026-10-10") }, EQ2: { rejectedAt: "2026-10-01", rejectedTs: Date.parse("2026-10-01") } } };
  const sent = { EQ2: { sentAt: "2026-10-05" } }; // EQ2 fixed and sent (still held until paid, but not "to fix")
  const fri = Date.parse("2026-10-23T19:00:00Z"); // Fri 3 PM NY
  const f = await moneyReport({ pip, payments, requests, sent, now: fri, loadLib });
  assert.equal(f.key, "f:2026-10-23", "once a Friday");
  assert.equal(f.title, "💵 Friday money: $1,400 owed");
  assert.match(f.body, /💰 HPD owes \$1,400 on 2 jobs/);
  assert.match(f.body, /✅ paid this week: \$1,000 \(2 payments\)/);
  assert.match(f.body, /💵 1 rejection to fix · \$1,400 held up/, "same numbers as the app (💰 To get paid)");
  assert.match(f.body, /⌛ oldest: EQ1 \$400 since 07\/01/);
  assert.doesNotMatch(f.body, /download/, "PIP numbers fresh");
  assert.match((await moneyReport({ pip, payments: null, requests, sent, now: fri })).body, /📥 PIP numbers from 10\/15: download the new summaries/, "old numbers: asks for new ones");
  assert.equal(await moneyReport({ pip, payments, requests, sent, now: Date.parse("2026-10-22T19:00:00Z") }), null, "not Thursday");
  assert.equal(await moneyReport({ pip, payments, requests, sent, now: Date.parse("2026-10-23T15:00:00Z") }), null, "not before 2 PM");
  console.log(`PASS Friday money report: Fridays from 2 PM: "${f.body}"`);
}

// 🗣 Voice + plain-words summary (owner, 22 Oct: "an actual voice: urgent email, message from Lewis, requesting
// documents, new invitation to bid, confirmation of award; summarize: they're looking for this work order").
{
  const { summarizeHpd, spokenAlert, cleanEmailText } = await loadLib("alert-summary");
  const gafurList = "Good day,\nThese are the list of OMOs that are missing documents, kindly submit the required documents.\n\n1. EP27489 – Affidavit and Invoice\n2. EP27382 - Affidavit and Invoice\n3. EP27310 – update / documents\n\nBest,\n\nDeoranie Gafur (She/Her)|Vendor Tracker\nAlternative Enforcement Program (AEP)";
  assert.equal(summarizeHpd({ kind: "request", subject: "Missing Documents", text: gafurList }), "Missing documents for 3 work orders: EP27489 affidavit and invoice, EP27382 affidavit and invoice and 1 more");
  assert.equal(summarizeHpd({ kind: "request", subject: "Missing Documents", text: "Good day,\nReceived.\n\nDeoranie Gafur (She/Her)|Vendor Tracker\n[cid:image001.png@01DD]<http://www.nyc.gov/x>" }), "They received it", "signature without 'Best,' and image tags dropped");
  assert.equal(summarizeHpd({ kind: "request", subject: "OMO#ER06498- STATUS UPDATE", text: "Good afternoon,\nKindly provide a status update on OMO#ER06498 as estimated date of completion has passed.\nThank you,\nJoy", omo: "ER06498" }), "They want a status update on ER06498: the completion date has passed");
  assert.equal(summarizeHpd({ kind: "request", subject: "OMO#ER01919- INCOMPLETE INVOICE", text: "Please see attached.", omo: "ER01919" }), "Incomplete invoice on ER01919");
  assert.equal(summarizeHpd({ kind: "notice", subject: "24 HR POOR PERFORMANCE NOTICE - OMO#EQ31364", text: "Please submit the affidavit and invoice within 24 hours.", omo: "EQ31364" }), "24-hour notice: they want the affidavit and invoice for EQ31364");
  assert.ok(!/wrote:|earlier/.test(cleanEmailText("Thanks for the update.\n\nOn Mon, Oct 20, 2026 at 9:00 AM Lewis wrote:\n> earlier text")), "quoted email left out");
  const say = (n) => spokenAlert(n);
  assert.equal(say({ kind: "award", title: "💰 You won · ER07640!", omo: "ER07640" }), "Confirmation of award! You won work order E R 0 7 6 4 0.");
  // Bids: no work order, just how many (22 Oct).
  assert.equal(say({ kind: "bid", title: "🧾 New invitation to bid · ER07749", omo: "ER07749", text: "1234 Main St · due 10/24 11:00 AM" }), "New invitation to bid.");
  assert.equal(say({ kind: "bid", title: "🧾 3 new invitations to bid" }), "You have 3 new invitations to bid.");
  assert.match(say({ kind: "notice", title: "⏱ 24-hour notice · EQ31364 from Joy-Ann Lewis", omo: "EQ31364", who: "Joy-Ann Lewis", text: "24-hour notice: they want the affidavit and invoice for EQ31364" }), /^Urgent email\. 24-hour notice from Lewis, work order E Q 3 1 3 6 4\. 24-hour notice: they want the affidavit and invoice for E Q 3 1 3 6 4$/);
  assert.match(say({ kind: "request", title: "📋 Deoranie Gafur asked for documents", who: "Deoranie Gafur", text: "Missing documents for 3 work orders: EP27489 affidavit and invoice" }), /^Request from Gafur, requesting documents\. Missing documents for 3 work orders: E P 2 7 4 8 9 affidavit and invoice$/);
  assert.equal(say({ kind: "request", title: "📋 Deoranie Gafur replied", who: "Deoranie Gafur", text: "They received it" }), "Gafur replied: received.");
  assert.match(say({ kind: "message", title: "📩 Joy-Ann Lewis wrote · ER06498", omo: "ER06498", who: "Joy-Ann Lewis", text: "Kindly provide a status update on OMO#ER06498" }), /^Email from Lewis, work order E R 0 6 4 9 8\. Kindly provide a status update on work order E R 0 6 4 9 8$/);
  console.log(`PASS voice + summary: Gafur's list -> "Missing documents for 3 work orders: EP27489 affidavit and invoice…"; "Received." / status update / incomplete invoice / 24-hour notice summarized; spoken: award, invitation, urgent notice, request, message with work orders read letter by letter`);
}

// 🎤 What the phone heard -> the search (22 Oct).
{
  const { spokenSearch } = await loadLib("job-search");
  assert.equal(spokenSearch("E R 0 8 2 8 3"), "ER08283");
  assert.equal(spokenSearch("er 08283."), "ER08283");
  assert.equal(spokenSearch("Find the job with mini split"), "mini split");
  assert.equal(spokenSearch("search for 3619 Bedford Avenue"), "3619 Bedford Avenue");
  console.log("PASS voice search words: spelled job numbers join up (E R 0 8 2 8 3 -> ER08283), 'find the job with' is dropped");
}

// 🗣 The voice helper: what was said -> what to do (22 Oct).
{
  const { parseCommand, findJobRef } = await loadLib("voice-agent");
  const p = (s) => parseCommand(s);
  assert.deepEqual(p("I finished ER01987"), { intent: "outcome", outcome: "WORK_COMPLETED", ref: "ER01987" });
  assert.deepEqual(p("Hey, I finished this job"), { intent: "outcome", outcome: "WORK_COMPLETED", ref: "" }, "this job = the one on screen");
  assert.deepEqual(p("job E R 0 1 9 8 7 is done"), { intent: "outcome", outcome: "WORK_COMPLETED", ref: "ER01987" });
  assert.deepEqual(p("no access at 707 east 189"), { intent: "outcome", outcome: "NO_ACCESS_1_WAITING_72H", ref: "707 east 189" });
  assert.equal(p("the tenant refused").outcome, "REFUSED_ACCESS");
  assert.equal(p("we did part of the job").outcome, "PARTIAL_WORK");
  assert.equal(p("read me the new bids").intent, "bids");
  assert.equal(p("what do I have today").intent, "today");
  assert.equal(p("which notices are open").intent, "notices");
  assert.deepEqual(p("read me this job"), { intent: "read-job", ref: "" });
  assert.equal(p("yes").intent, "yes");
  assert.equal(p("no").intent, "no");
  assert.deepEqual(p("mini split"), { intent: "search", text: "mini split" }, "plain words stay a search");
  assert.deepEqual(p("completed jobs"), { intent: "search", text: "completed jobs" });
  const jobs = [{ id: "ER01987", a: "707 EAST 189 STREET, 10458" }, { id: "EQ1", a: "707 EAST 189 STREET, 10458" }, { id: "EQ2", a: "12 MAPLE ST" }];
  assert.equal(findJobRef("ER01987", jobs, (j) => j.id, (j) => j.a).id, "ER01987");
  assert.equal(findJobRef("12 maple", jobs, (j) => j.id, (j) => j.a).id, "EQ2");
  assert.equal(findJobRef("707 east 189", jobs, (j) => j.id, (j) => j.a), "many", "two jobs at one address: ask for the number");
  console.log("PASS voice helper words: finished / no access / refused / partial with the job number, an address or 'this job'; bids / today / notices / read the job; yes / no; plain words stay a search");
}

// 🗣 Free questions go to the AI with the app's facts; commands and plain words don't (22 Oct).
{
  const { parseCommand } = await loadLib("voice-agent");
  assert.deepEqual(parseCommand("Which bid is the easiest to win today?"), { intent: "ask", question: "Which bid is the easiest to win today?" });
  assert.equal(parseCommand("how much money is HPD holding").intent, "ask");
  assert.equal(parseCommand("what does Gafur still need from me").intent, "ask");
  assert.equal(parseCommand("what do I have today").intent, "today", "commands first");
  assert.equal(parseCommand("read me the new bids").intent, "bids");
  assert.equal(parseCommand("mini split").intent, "search");
  const { aiAnswer, askFacts } = await import("../server/ai-draft.mjs");
  assert.equal(askFacts({ question: "" }), null);
  const ask = askFacts({ question: "Which bid is easiest?", facts: { openBids: [{ job: "ER1", work: "Door closer · 1 door" }] } });
  let sent = null;
  const env = { AI: { run: async (model, input) => { sent = input; return { response: "**ER1**, the door closer, is your easiest one." }; } } };
  const a = await aiAnswer(env, ask);
  assert.equal(a.ai, true);
  assert.equal(a.text, "ER1, the door closer, is your easiest one.", "no markdown in what's spoken");
  assert.match(sent.messages[0].content, /Use only the facts given/);
  assert.match(sent.messages[1].content, /Door closer/);
  assert.deepEqual(await aiAnswer({}, ask), { ai: false, reason: "not-set-up" });
  console.log("PASS free questions: questions -> AI with the app's facts (facts only, short, no markdown), commands and plain words stay; not set up -> says so");
}

// "which jobs I want today" (won, misheard) + "read me the description" (22 Oct).
{
  const { parseCommand } = await loadLib("voice-agent");
  assert.deepEqual(parseCommand("which jobs I want today"), { intent: "awards", days: 0, label: "today", describe: false });
  assert.equal(parseCommand("which jobs I want today read me the description").describe, true);
  assert.equal(parseCommand("read me the description of the jobs I won today").intent, "awards");
  assert.equal(parseCommand("I want to see the map").intent, "search", "'want' alone isn't won");
  console.log("PASS won misheard as want: with 'jobs' and a day it's the wins; 'read me the description' reads each one");
}

// 📱 Text the tenant: the ready text, the Messages link, and when to call (22 Oct).
{
  const { tenantTextDraft, smsHref, tenantStep } = await loadLib("tenant-text");
  const text = tenantTextDraft({ name: "NELLY ROSERIO", address: "707 EAST 189 STREET, 10458", apt: "3B", job: "Door closer · 1 door" });
  assert.equal(text, "Hi Nelly, this is Jot from United Angel Construction. HPD sent us to do a repair at 707 EAST 189 STREET, apt 3B: Door closer, 1 door. When is a good day and time for us to come? Please text or call back at this number. Thank you!");
  assert.equal(smsHref("(347) 555-0100", "Hi there", "iPhone"), "sms:3475550100&body=Hi%20there");
  assert.equal(smsHref("347-555-0100", "Hi", "Android"), "sms:3475550100?body=Hi");
  const texted = "2026-10-22T19:40:00Z"; // Thu 3:40 PM NY
  assert.equal(tenantStep({}).state, "none");
  assert.equal(tenantStep({ TenantTextedAt: texted }, Date.parse("2026-10-22T22:00:00Z")).state, "waiting", "same day: wait");
  assert.equal(tenantStep({ TenantTextedAt: texted }, Date.parse("2026-10-23T12:30:00Z")).state, "call", "next morning 8:30: call");
  assert.equal(tenantStep({ TenantTextedAt: texted }, Date.parse("2026-10-23T11:00:00Z")).state, "waiting", "next day before 8 AM: not yet");
  assert.equal(tenantStep({ TenantTextedAt: texted, TenantRepliedAt: "2026-10-22T20:00:00Z" }, Date.parse("2026-10-22T20:05:00Z")).state, "call", "they replied: call back");
  assert.equal(tenantStep({ TenantTextedAt: texted, FieldArrivedAt: "2026-10-23T14:00:00Z" }, Date.parse("2026-10-23T15:00:00Z")).state, "none", "visited: nothing to do");
  // The phone reminder: once per text, working hours.
  const recs = { EQ17776: { TenantTextedAt: texted } };
  const a = await findAlerts({ conversations: { threads: [] }, bids: [], sent: {}, requests: {}, now: Date.parse("2026-10-23T13:30:00Z"), loadLib, records: recs, addresses: { EQ17776: "707 EAST 189 STREET, 10458" } });
  const call = a.filter((x) => /Call the tenant/.test(x.title));
  assert.equal(call.length, 1);
  assert.equal(call[0].title, "📞 Call the tenant at 707 EAST 189 STREET");
  assert.equal((await findAlerts({ conversations: { threads: [] }, bids: [], sent: {}, requests: {}, now: Date.parse("2026-10-23T13:30:00Z"), loadLib, records: recs, addresses: {} })).find((x) => /Call the tenant/.test(x.title)).key, call[0].key, "same key: sent once");
  console.log(`PASS tenant text: "${text.slice(0, 60)}…", Messages link (iPhone / Android), wait same day, call next morning / after a reply, nothing after a visit; phone reminder once`);
}

// 🗣 Doing things by voice (in-app request 22 Oct: "talk and get everything done").
{
  const { parseCommand } = await loadLib("voice-agent");
  const p = (s) => parseCommand(s);
  assert.deepEqual(p("text the tenant"), { intent: "text-tenant", ref: "" });
  assert.deepEqual(p("send a text to the tenant for EQ15239"), { intent: "text-tenant", ref: "EQ15239" });
  assert.deepEqual(p("call the tenant"), { intent: "call-tenant", ref: "" });
  assert.deepEqual(p("take me to the next stop"), { intent: "navigate", ref: "", next: true });
  assert.deepEqual(p("navigate to 707 east 189"), { intent: "navigate", ref: "707 east 189", next: false });
  assert.deepEqual(p("I'm here"), { intent: "arrived", ref: "" });
  assert.deepEqual(p("open job E R 0 8 2 8 3"), { intent: "open", ref: "ER08283" });
  assert.equal(p("I finished this job").intent, "outcome", "the earlier commands still work");
  assert.equal(p("mini split").intent, "search");
  console.log("PASS voice actions: text / call the tenant, navigate (a job or the next stop), I'm here, open a job; earlier commands unchanged");
}

// 🗣 "Plan my day" (22 Oct).
{
  const { parseCommand } = await loadLib("voice-agent");
  for (const s of ["plan my day", "build my route", "where should I go first", "make today's route"]) assert.equal(parseCommand(s).intent, "plan", s);
  assert.equal(parseCommand("take me to the next stop").intent, "navigate");
  console.log("PASS plan my day: 'plan my day' / 'build my route' / 'where should I go first' plan Today's route");
}

// 🗣 Notices and paperwork by voice (22 Oct).
{
  const { parseCommand } = await loadLib("voice-agent");
  assert.deepEqual(parseCommand("answer the notice for E R 0 1 9 8 7"), { intent: "reply-notice", ref: "ER01987", who: "" });
  assert.deepEqual(parseCommand("reply to Lewis"), { intent: "reply-notice", ref: "", who: "lewis" });
  assert.deepEqual(parseCommand("send the package for EQ17776"), { intent: "paperwork", ref: "EQ17776" });
  assert.equal(parseCommand("do the paperwork for this job").intent, "paperwork");
  console.log("PASS notices / paperwork by voice: answer the notice for a job / reply to Lewis or Gafur; do the paperwork / send the package");
}
