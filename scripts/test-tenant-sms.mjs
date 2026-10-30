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
assert.match(body, /^Hello Maria, this is Jot from United Angel Construction, the contractor NYC HPD assigned to the repair at 500 FT WASHINGTON AVENUE, apt 4B \(HPD work order ER05729\)\. The work: .*lock/i);
assert.match(saved.ER05729.FieldVisitHistory.at(-1).note, /^Texted the tenant the job summary \(automatic, on the award\): .*lock/i, "on the job's contact log");
assert.ok(!JSON.stringify(saved.ER05729.FieldVisitHistory).includes("Maria") && !JSON.stringify(saved.ER05729.FieldVisitHistory).includes("555"), "no name or phone on the log");
assert.ok(saved.ER05729.TenantTextedAt, "remembered on the job");
assert.equal(saved.ER05729.TenantTextedBy, "auto");
assert.match(day[0].title, /Texted the tenant · ER05729/);
const again = await autoTextAwards({ ...base, awards, records: saved, now: Date.parse("2026-10-23T15:10:00Z") });
assert.equal(again.length, 0, "never twice");
assert.equal(calls.length, 1);
const off = await autoTextAwards({ ...base, awards, records: {}, env: { ...env, AUTO_TENANT_TEXT: "off" }, now: Date.parse("2026-10-23T15:00:00Z") });
assert.equal(off.length, 0, "AUTO_TENANT_TEXT=off stops it");
const offInApp = await autoTextAwards({ ...base, awards, records: { "SETTINGS-AUTOPILOT": { autoTenantText: false } }, now: Date.parse("2026-10-23T15:00:00Z") });
assert.equal(offInApp.length, 0, "the app's Autopilot switch stops it");
const failing = async () => new Response(JSON.stringify({ code: 21610, message: "Attempt to send to unsubscribed recipient" }), { status: 400 });
const failed = {};
await autoTextAwards({ ...base, awards, records: {}, fetcher: failing, save: async (o, r) => { failed[o] = r; }, now: Date.parse("2026-10-23T15:00:00Z") });
assert.ok(failed.ER05729.AutoTextTried && /21610/.test(failed.ER05729.AutoTextError), "a failure is remembered, not retried every run");
// Today's calling round (30 Oct): calls / texts today in New York time, reached today; yesterday's don't count.
{
  const { tenantContactState } = await loadLib("tenant-text");
  const now = Date.parse("2026-10-30T15:00:00Z"); // 11 AM New York
  const job = { FieldVisitHistory: [
    { recordedAt: "2026-10-30T03:30:00Z", note: "Called the tenant: no answer" }, // 10/29 11:30 PM New York: yesterday
    { recordedAt: "2026-10-30T13:05:00Z", note: "Texted the tenant the job summary: Leak" },
    { recordedAt: "2026-10-30T14:10:00Z", note: "Called the tenant: no answer" },
  ] };
  const a = tenantContactState(job, false, now);
  assert.equal(a.tries, 3); assert.equal(a.triesToday, 2); assert.equal(a.reachedToday, false); assert.equal(a.tone, "try");
  job.FieldVisitHistory.push({ recordedAt: "2026-10-30T14:40:00Z", note: "Talked to the tenant" });
  const b = tenantContactState(job, false, now);
  assert.equal(b.tone, "ok"); assert.equal(b.reachedToday, true); assert.equal(b.triesToday, 3, "the call that got through counts");
  assert.equal(tenantContactState(job, false, now + 86400000).triesToday, 0, "tomorrow starts at zero");
  // 📋 The contact record (30 Oct): oldest first, New York time, the work order and address, no phone numbers.
  const { tenantContactRecord } = await loadLib("tenant-text");
  const rec = tenantContactRecord({ omo: "ER05729", address: "500 FT WASHINGTON AVENUE, 10033", log: job.FieldVisitHistory });
  const recLines = rec.split(/\n/);
  assert.equal(recLines[0], "Tenant contact record, HPD work order ER05729, 500 FT WASHINGTON AVENUE (United Angel Construction):");
  assert.equal(recLines[1], "- Thu, 10/29/2026, 11:30 PM: Called the tenant: no answer");
  assert.equal(recLines[2], "- Fri, 10/30/2026, 9:05 AM: Texted the tenant the job summary: Leak");
  assert.equal(recLines[4], "- Fri, 10/30/2026, 10:40 AM: Talked to the tenant");
  assert.match(recLines.at(-1), /New York time/);
  assert.ok(!/\d{3}\D?\d{3}\D?\d{4}/.test(rec), "no phone numbers");
  assert.match(tenantContactRecord({ omo: "ER05729", address: "", log: [] }), /No contact recorded yet/);
  // 📍 Go anyway (30 Oct): 3 tries over 2+ days, not reached -> yes; reached, 2 days not passed, or a public area -> no.
  const tries3 = { FieldVisitHistory: job.FieldVisitHistory.slice(0, 3) };
  assert.equal(tenantContactState(tries3, false, now).goAnyway, false, "first try 11.5 hours ago");
  assert.equal(tenantContactState(tries3, false, now + 2 * 86400000).goAnyway, true, "3 tries, 2 days on");
  assert.equal(tenantContactState(tries3, true, now + 2 * 86400000).goAnyway, false, "public area");
  assert.equal(tenantContactState(job, false, now + 2 * 86400000).goAnyway, false, "reached");
  assert.equal(tenantContactState({ FieldVisitHistory: tries3.FieldVisitHistory.slice(0, 2) }, false, now + 5 * 86400000).goAnyway, false, "2 tries");
}
console.log("PASS text service: US numbers only, Twilio form and auth, forged replies refused, inbox keeps replies; award text once in working hours with the tenant's name, address, apartment and the work; STOP / errors remembered; AUTO_TENANT_TEXT=off or the app's Autopilot switch stops it; today's calls / texts and reached today");
