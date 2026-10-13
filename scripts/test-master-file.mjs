// Master file: encryption round trip (and unreadable without the key), what goes in per job, the
// status server copy kept when it can't answer, and the restore plan (only missing / older, never delete).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildMaster, decrypt, encrypt, fetchOverrides } from "./build-master-file.mjs";
import { restorePlan } from "./restore-from-master.mjs";

const key = crypto.randomBytes(32).toString("base64");
const secret = JSON.stringify({ jobs: { EQ26843: { address: "154 SOUTH 3 STREET" } }, bids: { ER05994: { price: 1987 } } });
const sealed = encrypt(secret, key);
assert.equal(decrypt(sealed, key), secret, "decrypts with the key");
assert.ok(!/EQ26843|SOUTH 3|1987/.test(sealed), "unreadable without the key");
assert.throws(() => decrypt(sealed, crypto.randomBytes(32).toString("base64")), "a wrong key can't open it");
assert.throws(() => encrypt("x", "short"), /32 bytes/);

const followUpOf = (job) => ({ state: job.FieldOutcome ? "done" : "open" });
const m = buildMaster({
  jobs: [{ OMO: "EQ1", BuildingAddress: "1 MAIN ST", AwardDate: "09/01/26", WorkCompletionDate: "09/10/26", AwardAmount: "500", Junk: "x" }, { OMO: "EQ2", BuildingAddress: "2 MAIN ST" }],
  overrides: { EQ1: { FieldOutcome: "WORK_COMPLETED", PackageApprovedAt: "2026-09-12T10:00:00Z", updatedAt: "2026-09-12T10:00:00Z" }, "BID-ER9": { omo: "ER9", price: 450 }, "BIDDING-SESSION": { active: false } },
  overridesInfo: { ok: true }, hpd: { EQ2: { closedReason: "No Access", amount: 100 } },
  sent: { EQ1: [{ date: "2026-09-12", to: "hpd", file: "EQ1 AFF INVOICE.pdf" }] }, yourAwards: { EQ1: "2026-09-01" }, upcoming: [{ omo: "ER9" }],
  followUpOf, today: "2026-10-13", now: "2026-10-13T23:00:00Z",
});
assert.deepEqual(Object.keys(m.jobs), ["EQ1", "EQ2"]);
assert.deepEqual(m.jobs.EQ1.job, { OMO: "EQ1", BuildingAddress: "1 MAIN ST", AwardDate: "09/01/26", WorkCompletionDate: "09/10/26", AwardAmount: "500" }, "job fields only");
assert.equal(m.jobs.EQ1.saved.PackageApprovedAt, "2026-09-12T10:00:00Z", "everything saved from the phones");
assert.equal(m.jobs.EQ1.paperworkSent.length, 1);
assert.deepEqual(m.jobs.EQ2.hpd, { closedReason: "No Access", amount: 100 });
assert.deepEqual([m.jobs.EQ1.followUp.state, m.jobs.EQ2.followUp.state], ["done", "open"]);
assert.deepEqual(m.bids, { ER9: { omo: "ER9", price: 450 } });
assert.deepEqual(Object.keys(m.other), ["BIDDING-SESSION"]);
assert.equal(Object.keys(m.statusServerData).length, 3, "the server's data exactly as it was, for restoring");
assert.deepEqual([m.sources.jobs, m.sources.bids, m.sources.savedEntries], [2, 1, 3]);

// The status server failing: retried, and reported (the caller keeps the last copy).
let calls = 0;
const failing = async () => { calls++; return new Response("error code: 1101", { status: 500 }); };
const res = await fetchOverrides(failing, 3, 1);
assert.deepEqual([res.ok, calls], [false, 3]);
const working = async () => new Response(JSON.stringify({ ok: true, overrides: { EQ1: { a: 1 } } }));
assert.deepEqual(await fetchOverrides(working, 3, 1), { ok: true, overrides: { EQ1: { a: 1 } } });

// Restore: only what's missing on the server or older there; nothing deleted.
const plan = restorePlan(
  { EQ1: { FieldOutcome: "WORK_COMPLETED", updatedAt: "2026-10-01" }, EQ2: { updatedAt: "2026-10-05" }, EQ3: { updatedAt: "2026-09-01" } },
  { EQ2: { updatedAt: "2026-10-01" }, EQ3: { updatedAt: "2026-10-02" }, EQ4: { updatedAt: "2026-10-03" } },
);
assert.deepEqual(plan.map((p) => [p.key, p.why.split(" (")[0]]), [["EQ1", "missing on the server"], ["EQ2", "server copy older"]], "EQ3 newer on the server stays; EQ4 not in the backup is untouched");
console.log("PASS master file: encrypted (unreadable without the key), every job with its saved data, HPD status, paperwork and follow-up, bids; status server retried; restore only puts back missing / older entries");
