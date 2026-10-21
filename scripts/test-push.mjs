// Phone alerts (20 Oct): the server keeps a phone's push address encrypted (PUSH-<id> on the status server) and only
// takes real push-service addresses; the fetcher's sender finds what's new (HPD wrote / replied, a new invitation, a
// 24-hour notice under 6 hours) and decrypts the addresses with the same key.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handlePushSubscribe } from "../server/drive-packages.mjs";
import { eveningWrapup, findAlerts, morningBriefing, openSealed, workingHours } from "./send-push.mjs";
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

// Overdue notices remind again every 2 hours in working hours (21 Oct, ER01987).
{
  const threads = [{ id: "od", subject: "72 HR POOR PERFORMANCE NOTICE - OMO#ER01987", omos: ["ER01987"], kind: "past due", people: ["Joy-Ann Lewis"], messages: [{ at: "2026-10-16T19:58:35Z", mine: false, hpd: true, from: "Lewis, Joy-Ann (HPD)", subject: "72 HR", text: "Notice lewisj@hpd.nyc.gov" }] }];
  const at = (iso) => findAlerts({ conversations: { threads }, bids: [], sent: {}, requests: {}, now: Date.parse(iso), loadLib });
  const tue6pm = await at("2026-10-21T22:00:00Z"); // Wed 6 PM NY, 2 h overdue
  const over = tue6pm.filter((a) => a.key.startsWith("o:"));
  assert.equal(over.length, 1);
  assert.match(over[0].title, /^⏰ ER01987: notice overdue 2 h — answer now$/);
  const later = (await at("2026-10-22T00:30:00Z")).filter((a) => a.key.startsWith("o:")); // 8:30 PM NY: no repeat at night
  assert.equal(later.length, 0, "no reminders after 8 PM");
  const nextDay = (await at("2026-10-22T13:00:00Z")).filter((a) => a.key.startsWith("o:")); // Thu 9 AM
  assert.equal(nextDay.length, 1);
  assert.notEqual(nextDay[0].key, over[0].key, "a new 2-hour slot is a new reminder");
  assert.equal(workingHours(Date.parse("2026-10-24T15:00:00Z")), false, "Saturday");
  console.log("PASS overdue reminders: ER01987 (72 h, due 10/21 3:58 PM) -> '⏰ notice overdue 2 h — answer now' every 2 hours, weekdays 8 AM-8 PM only, each slot its own alert");
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
