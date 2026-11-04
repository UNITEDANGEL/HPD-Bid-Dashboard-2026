// Weekly check-up: groups the week's phone errors, takes out emails/phone numbers, flags pages that don't open.
import assert from "node:assert/strict";
import { runCheckup } from "./weekly-checkup.mjs";

const now = new Date().toISOString(), old = new Date(Date.now() - 10 * 86400000).toISOString();
const overrides = { "APP-ERRORS-a": { errors: [
  { at: now, kind: "error", msg: "Boom call 212-555-1234 or me@x.com", n: 2 },
  { at: now, kind: "error", msg: "Boom call 212-555-1234 or me@x.com" },
  { at: old, kind: "error", msg: "too old" }] } };
const mk = (bad) => async (u) => u.includes("workers.dev") ? { ok: true, json: async () => ({ overrides }) } : { ok: !u.includes(bad), status: 404 };

let r = await runCheckup(mk("whats-new"));
assert.equal(r.ok, false);
assert.equal(r.errorCount, 3);
assert.equal(r.errors.length, 1);
assert.ok(!/@|555/.test(r.errors[0].what), "private bits taken out");
assert.equal(r.broken.length, 1);
overrides["APP-ERRORS-a"].errors = [];
r = await runCheckup(mk("zzz"));
assert.equal(r.ok, true);
console.log("weekly check-up tests passed");
