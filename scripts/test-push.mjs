// Phone alerts (20 Oct): the server keeps a phone's push address encrypted (PUSH-<id> on the status server) and only
// takes real push-service addresses; the fetcher's sender finds what's new (HPD wrote / replied, a new invitation, a
// 24-hour notice under 6 hours) and decrypts the addresses with the same key.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handleDrivePackages } from "../server/drive-packages.mjs";
import { findAlerts, openSealed } from "./send-push.mjs";
import { loadLib } from "./daily-report.mjs";

const key = crypto.randomBytes(32);
const env = { HPD_PRIVATE_DATA_KEY: key.toString("base64") };
const posted = [];
const fetcher = async (url, opts) => { posted.push({ url, body: JSON.parse(opts.body) }); return Response.json({ ok: true }); };
const sub = { endpoint: "https://web.push.apple.com/QGx1Y2FzLXRlc3QtZW5kcG9pbnQ", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
const call = (body) => handleDrivePackages(new Request("https://app.example.test/api/drive/push-subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "push-subscribe", { Authorization: "Bearer test" }, fetcher, env, "owner@example.test");

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
const alerts = await findAlerts({ conversations, bids, sent: {}, now, loadLib });
const titles = alerts.map((a) => a.title);
assert.ok(titles.includes("📩 Deoranie Gafur replied · EP27382"), titles.join(" | "));
assert.ok(!titles.some((t) => /EQ00001/.test(t)), "old emails don't alert");
assert.ok(titles.includes("🧾 New invitation to bid · ER09999"));
assert.ok(!titles.some((t) => /ER00001/.test(t)), "past invitations don't alert");
assert.ok(titles.some((t) => /^⏰ EQ99997: \d+ h left on the notice$/.test(t)), titles.join(" | "));
assert.ok(alerts.every((a) => /^[ebu]:[0-9a-f]{16}$/.test(a.key)), "kept as short hashes");
assert.equal(alerts.find((a) => /Gafur/.test(a.title)).url, "/map/?view=all&map=1&board=1");
console.log("PASS phone alert finder: Gafur's reply (her name, 'replied'), a new invitation, a 24-hour notice under 6 h; old emails / past invitations left out; remembered as short hashes");
