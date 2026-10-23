// The text service (server/tenant-sms.mjs) and the automatic first text on an award (scripts/send-push.mjs), with
// Twilio faked: nothing is sent. Phone numbers are checked, only Twilio's signed replies are taken, the award text goes
// once per job in working hours, and a failure is remembered instead of retried every 10 minutes.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sendSms, smsReady, twilioSignatureOk, usPhone, saveReply, readReplies } from "../server/tenant-sms.mjs";
import { autoTextAwards } from "./send-push.mjs";
import { loadLib } from "./daily-report.mjs";

const env = { TWILIO_ACCOUNT_SID: "ACtest", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM: "+12125550100" };
assert.equal(smsReady({}), false);
assert.equal(smsReady(env), true);
assert.equal(usPhone("(718) 555-0199"), "+17185550199");
assert.equal(usPhone("1-718-555-0199"), "+17185550199");
assert.equal(usPhone("555-0199"), "", "too short");
assert.equal(usPhone("(011) 555-0199"), "", "not a US area code");

const calls = [];
const twilio = async (url, opts) => { calls.push({ url, opts }); return new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 }); };
assert.equal((await sendSms({}, "7185550199", "hello there", twilio)).reason, "not-set-up");
const ok = await sendSms(env, "(718) 555-0199", "Hello, this is Jot.", twilio);
assert.equal(ok.sent, true);
assert.equal(ok.to, "***0199", "the full number isn't echoed back");
const form = new URLSearchParams(calls[0].opts.body);
assert.equal(form.get("To"), "+17185550199");
assert.equal(form.get("From"), "+12125550100");
assert.match(calls[0].url, /Accounts\/ACtest\/Messages\.json$/);
assert.equal((await sendSms(env, "12", "Hello", twilio)).sent, false);

// Twilio's signature on replies.
const url = "https://hpd-bid-dashboard-2026.pages.dev/api/sms-inbound";
const params = new URLSearchParams({ From: "+17185550199", Body: "Thursday morning works", MessageSid: "SM9" });
const sig = crypto.createHmac("sha1", "secret").update(url + [...params.keys()].sort().map((k) => k + params.get(k)).join("")).digest("base64");
assert.equal(await twilioSignatureOk("secret", url, params, sig), true);
assert.equal(await twilioSignatureOk("secret", url, params, sig.replace(/.$/, "A")), false, "a forged reply is refused");
assert.equal(await twilioSignatureOk("secret", url, params, ""), false);

// The private inbox keeps the last replies.
const store = new Map();
const kv = { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
await saveReply(kv, { from: "+17185550199", body: "Thursday", at: "2026-10-23T15:00:00Z" });
await saveReply(kv, { from: "+17185550199", body: "10 am", at: "2026-10-23T15:05:00Z" });
assert.equal((await readReplies(kv)).length, 2);
assert.deepEqual((await readReplies(kv, "2026-10-23T15:01:00Z")).map((r) => r.body), ["10 am"]);

// The automatic award text: once, in working hours, remembered on the job.
const saved = {};
const save = async (omo, rec) => { saved[omo] = rec; };
const awards = [{ tag: "a-ER05729" }, { tag: "a-ER00001" }, { tag: "a-ER00002" }];
const tenants = { jobs: { ER05729: { TenantName: "MARIA LOPEZ", TenantPhone: "(718) 555-0199", ApartmentUnit: "4B" }, ER00002: { TenantName: "X", TenantPhone: "none" } } };
const base = { tenants, addresses: { ER05729: "500 FT WASHINGTON AVENUE, 10033" }, descriptions: { ER05729: "Remove and replace defective door lock at apartment entrance door." }, loadLib, env, fetcher: twilio, save };
calls.length = 0;
const night = await autoTextAwards({ ...base, awards, records: {}, now: Date.parse("2026-10-23T03:00:00Z") });
assert.equal(night.length, 0, "not at night");
assert.equal(calls.length, 0);
const day = await autoTextAwards({ ...base, awards, records: {}, now: Date.parse("2026-10-23T15:00:00Z") });
assert.equal(day.length, 1, "only the job with a real tenant phone");
assert.equal(calls.length, 1);
const body = new URLSearchParams(calls[0].opts.body).get("Body");
assert.match(body, /^Hi Maria, this is Jot from United Angel Construction\. HPD sent us to do a repair at 500 FT WASHINGTON AVENUE, apt 4B: .*lock/i);
assert.ok(saved.ER05729.TenantTextedAt, "remembered on the job");
assert.equal(saved.ER05729.TenantTextedBy, "auto");
assert.match(day[0].title, /Texted the tenant · ER05729/);
const again = await autoTextAwards({ ...base, awards, records: saved, now: Date.parse("2026-10-23T15:10:00Z") });
assert.equal(again.length, 0, "never twice");
assert.equal(calls.length, 1);
const off = await autoTextAwards({ ...base, awards, records: {}, env: { ...env, AUTO_TENANT_TEXT: "off" }, now: Date.parse("2026-10-23T15:00:00Z") });
assert.equal(off.length, 0, "AUTO_TENANT_TEXT=off stops it");
const failing = async () => new Response(JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }), { status: 400 });
const failed = {};
await autoTextAwards({ ...base, awards, records: {}, fetcher: failing, save: async (o, r) => { failed[o] = r; }, now: Date.parse("2026-10-23T15:00:00Z") });
assert.ok(failed.ER05729.AutoTextTried && /21610/.test(failed.ER05729.AutoTextError), "a failure is remembered, not retried every run");
console.log("PASS text service: US numbers only, Twilio form and auth, forged replies refused, inbox keeps replies; award text once in working hours with the tenant's name, address, apartment and the work; STOP / errors remembered; AUTO_TENANT_TEXT=off stops it");
